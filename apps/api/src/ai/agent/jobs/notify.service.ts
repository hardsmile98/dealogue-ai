import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramChatEntity } from '../../../telegram/entities/telegram-chat.entity.js';
import { TelegramOutboundService } from '../../../telegram/services/telegram-outbound.service.js';
import { AiConfig } from '../../ai.config.js';
import { AiDraftEntity } from '../../entities/ai-draft.entity.js';
import type { JobContext, JobOutcome } from '../../jobs/ai-job-worker.service.js';
import { AiJobWorker } from '../../jobs/ai-job-worker.service.js';
import { AiSettingsService } from '../../settings/ai-settings.service.js';
import { buildNotifyText, isOpen } from '../drafts/draft-decision.js';

const OFFLINE_RETRY_MS = 60_000;

/**
 * Уведомление менеджеру в Telegram о черновике (раздел 7 ТЗ): «Избранное»
 * аккаунта или `handoffPeer`. Тексты черновиков не дублируем — чтобы их
 * нельзя было переслать клиенту по ошибке.
 */
@Injectable()
export class NotifyService implements OnModuleInit {
  private readonly logger = new Logger(NotifyService.name);

  constructor(
    @InjectRepository(AiDraftEntity)
    private readonly drafts: Repository<AiDraftEntity>,
    @InjectRepository(TelegramChatEntity)
    private readonly chats: Repository<TelegramChatEntity>,
    private readonly worker: AiJobWorker,
    private readonly settings: AiSettingsService,
    private readonly telegram: TelegramOutboundService,
    private readonly config: AiConfig,
  ) {}

  onModuleInit(): void {
    this.worker.register('notify', (ctx) => this.handle(ctx));
  }

  async handle(ctx: JobContext): Promise<JobOutcome> {
    const { job } = ctx;
    if (job.payload.cancelled === true) return { kind: 'cancelled' };
    const draftId = job.payload.draftId;
    if (typeof draftId !== 'string') return { kind: 'done' };

    const draft = await this.drafts.findOne({ where: { id: draftId } });
    // Менеджер уже решил вопрос в вебе — уведомление не нужно.
    if (!draft || !isOpen(draft.status)) return { kind: 'done' };

    const settings = await this.settings.get(draft.accountId);
    if (!settings.notifyTelegram) return { kind: 'done' };
    if (!this.telegram.isOnline(draft.accountId)) {
      return { kind: 'postpone', runAt: new Date(Date.now() + OFFLINE_RETRY_MS), reason: 'Аккаунт не подключён к Telegram', payload: { offline: true } };
    }

    const chat = await this.chats.findOne({ where: { id: draft.chatId } });
    const text = buildNotifyText({
      kind: draft.kind,
      reason: draft.handoffReason,
      peerName: chat?.peerName ?? '',
      clientText: draft.clientText,
      link: `${this.config.webUrl}/accounts/${draft.accountId}/chats/${draft.chatId}`,
    });
    await this.telegram.sendToPeer(draft.accountId, settings.handoffPeer ?? 'me', text);
    this.logger.log(`Черновик ${draft.id}: уведомление отправлено в ${settings.handoffPeer ?? 'Избранное'}`);
    return { kind: 'done' };
  }
}
