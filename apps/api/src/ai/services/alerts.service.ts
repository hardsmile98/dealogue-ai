import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { TelegramAccountEntity } from '../../telegram/entities/telegram-account.entity.js';
import { TelegramChatEntity } from '../../telegram/entities/telegram-chat.entity.js';
import { toAlertDto } from '../ai.types.js';
import type { AlertDto } from '../ai.types.js';
import { AlertEntity } from '../entities/alert.entity.js';
import type { AlertPayload, AlertStatus, AlertType } from '../entities/alert.entity.js';

export interface CreateAlertParams {
  accountId: string;
  chatId: string | null;
  type: AlertType;
  payload: AlertPayload;
}

const LIST_LIMIT = 200;

/** Алерты менеджеру: создание без дублей, список по владельцу, ack/resolve. */
@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(AlertEntity)
    private readonly alerts: Repository<AlertEntity>,
    @InjectRepository(TelegramChatEntity)
    private readonly chats: Repository<TelegramChatEntity>,
    @InjectRepository(TelegramAccountEntity)
    private readonly accounts: Repository<TelegramAccountEntity>,
    private readonly dataSource: DataSource,
    private readonly realtime: RealtimeService,
  ) {}

  /** Открытый алерт того же типа по чату уже есть → вернём его, нового не создаём. */
  async create(params: CreateAlertParams): Promise<{ alert: AlertEntity; created: boolean }> {
    if (params.chatId) {
      const existing = await this.alerts.findOne({
        where: { chatId: params.chatId, type: params.type, status: 'open' },
      });
      if (existing) return { alert: existing, created: false };
    }
    let alert: AlertEntity;
    try {
      alert = await this.alerts.save(this.alerts.create({ ...params, status: 'open' }));
    } catch {
      // Гонка с частичным уникальным индексом — берём победителя.
      const winner = params.chatId
        ? await this.alerts.findOne({ where: { chatId: params.chatId, type: params.type, status: 'open' } })
        : null;
      if (!winner) throw new Error('Не удалось создать алерт');
      return { alert: winner, created: false };
    }
    await this.realtime.publishForAccount(params.accountId, {
      type: 'alert.created',
      accountId: params.accountId,
      chatId: params.chatId,
      alertId: alert.id,
      alertType: alert.type,
    });
    return { alert, created: true };
  }

  async list(userId: string, statuses: AlertStatus[], accountId?: string): Promise<AlertDto[]> {
    const accountIds = await this.accountIdsOf(userId, accountId);
    if (accountIds.length === 0) return [];
    const rows = await this.alerts.find({
      where: { accountId: In(accountIds), status: In(statuses) },
      order: { createdAt: 'DESC' },
      take: LIST_LIMIT,
    });
    return this.decorate(rows);
  }

  async countOpen(userId: string): Promise<number> {
    const accountIds = await this.accountIdsOf(userId);
    if (accountIds.length === 0) return 0;
    return this.alerts.count({ where: { accountId: In(accountIds), status: 'open' } });
  }

  async acknowledge(userId: string, alertId: string): Promise<AlertDto> {
    const alert = await this.requireOwned(userId, alertId);
    if (alert.status === 'open') {
      alert.status = 'acknowledged';
      alert.acknowledgedAt = new Date();
      alert.acknowledgedBy = userId;
      await this.alerts.save(alert);
      await this.publishUpdate(alert);
    }
    return (await this.decorate([alert]))[0];
  }

  async resolve(userId: string, alertId: string): Promise<AlertDto> {
    const alert = await this.requireOwned(userId, alertId);
    if (alert.status !== 'resolved') {
      alert.status = 'resolved';
      alert.resolvedAt = new Date();
      alert.resolvedBy = userId;
      await this.alerts.save(alert);
      await this.publishUpdate(alert);
      if (alert.chatId) await this.refreshAttention(alert.chatId);
    }
    return (await this.decorate([alert]))[0];
  }

  /** Открытие чата менеджером = «увидел»: open → acknowledged. */
  async acknowledgeForChat(userId: string, chatId: string): Promise<void> {
    const open = await this.alerts.find({ where: { chatId, status: 'open' } });
    for (const alert of open) {
      alert.status = 'acknowledged';
      alert.acknowledgedAt = new Date();
      alert.acknowledgedBy = userId;
      await this.alerts.save(alert);
      await this.publishUpdate(alert);
    }
  }

  /** Все активные алерты чата — в resolved, пометку с чата снять. */
  async resolveForChat(chatId: string, byUserId: string | null): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE "alerts" SET "status" = 'resolved', "resolved_at" = now(), "resolved_by" = $2
      WHERE "chat_id" = $1 AND "status" IN ('open', 'acknowledged')
      `,
      [chatId, byUserId],
    );
    await this.refreshAttention(chatId);
  }

  /** needs_attention на чате = есть хоть один незакрытый алерт. */
  async refreshAttention(chatId: string): Promise<void> {
    const active = await this.alerts.findOne({
      where: { chatId, status: In<AlertStatus>(['open', 'acknowledged']) },
      order: { createdAt: 'DESC' },
    });
    const chat = await this.chats.findOne({ where: { id: chatId } });
    if (!chat) return;
    await this.chats.update(chatId, {
      needsAttention: Boolean(active),
      attentionReason: active ? active.type : null,
      attentionAt: active ? active.createdAt : null,
    });
    await this.realtime.publishForAccount(chat.accountId, { type: 'chat.updated', accountId: chat.accountId, chatId });
  }

  // --- внутреннее -----------------------------------------------------------

  private async requireOwned(userId: string, alertId: string): Promise<AlertEntity> {
    const alert = await this.alerts.findOne({ where: { id: alertId } });
    if (!alert) throw new NotFoundException('Алерт не найден');
    const owned = await this.accounts.findOne({ where: { id: alert.accountId, userId }, select: { id: true } });
    if (!owned) throw new NotFoundException('Алерт не найден');
    return alert;
  }

  private async accountIdsOf(userId: string, accountId?: string): Promise<string[]> {
    const rows = await this.accounts.find({
      where: accountId ? { userId, id: accountId } : { userId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async decorate(rows: AlertEntity[]): Promise<AlertDto[]> {
    const chatIds = [...new Set(rows.map((r) => r.chatId).filter((id): id is string => Boolean(id)))];
    const accountIds = [...new Set(rows.map((r) => r.accountId))];
    const [chats, accounts] = await Promise.all([
      chatIds.length > 0 ? this.chats.find({ where: { id: In(chatIds) } }) : [],
      accountIds.length > 0 ? this.accounts.find({ where: { id: In(accountIds) } }) : [],
    ]);
    const chatMap = new Map(chats.map((c) => [c.id, c]));
    const accountMap = new Map(accounts.map((a) => [a.id, a]));
    return rows.map((row) => {
      const chat = row.chatId ? chatMap.get(row.chatId) : undefined;
      const account = accountMap.get(row.accountId);
      return toAlertDto(
        row,
        chat ? { peerName: chat.peerName, peerUsername: chat.peerUsername } : null,
        account ? { displayName: account.displayName, phone: account.phone } : null,
      );
    });
  }

  private async publishUpdate(alert: AlertEntity): Promise<void> {
    await this.realtime.publishForAccount(alert.accountId, {
      type: 'alert.updated',
      accountId: alert.accountId,
      chatId: alert.chatId,
      alertId: alert.id,
      status: alert.status,
    });
  }
}
