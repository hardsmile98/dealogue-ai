import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Not, Repository } from 'typeorm';
import { TelegramChatEntity } from '../../../telegram/entities/telegram-chat.entity.js';
import { TelegramMessageEntity } from '../../../telegram/entities/telegram-message.entity.js';
import type { AiAccountSettingsEntity } from '../../entities/ai-account-settings.entity.js';
import { AiTurnEntity } from '../../entities/ai-turn.entity.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** Час и сутки — окна лимитов; перенос хода считаем от них же. */
const RETRY_HOUR_WINDOW_MS = 10 * 60_000;
/** Дневной лимит сообщений в чат освобождается медленно — заглядываем раз в час. */
const RETRY_DAY_WINDOW_MS = 60 * 60_000;

/** Лимит исчерпан: что написать в журнал и когда вернуться. */
export interface LimitHit {
  reason: string;
  retryMs: number;
}

/**
 * Лимиты агента (разделы 6.1 и 7 ТЗ): вызовы модели по аккаунту и сообщения
 * бота — в один чат за сутки и по аккаунту за час. Ход не отменяем, а
 * переносим: тема разговора никуда не денется, а сообщений в чате станет
 * меньше, чем у живого человека.
 */
@Injectable()
export class TurnLimitsService {
  constructor(
    @InjectRepository(AiTurnEntity)
    private readonly turns: Repository<AiTurnEntity>,
    @InjectRepository(TelegramMessageEntity)
    private readonly messages: Repository<TelegramMessageEntity>,
  ) {}

  /** Вызовы модели по аккаунту: в час и в сутки. */
  async llmCalls(accountId: string, settings: AiAccountSettingsEntity, now: Date): Promise<LimitHit | null> {
    const { llmCallsPerHour, llmCallsPerDay } = settings.limits;
    const hour = await this.turns.count({ where: { accountId, createdAt: MoreThan(new Date(now.getTime() - HOUR_MS)) } });
    if (hour >= llmCallsPerHour) {
      return { reason: `Лимит вызовов модели в час (${llmCallsPerHour}) исчерпан`, retryMs: RETRY_HOUR_WINDOW_MS };
    }
    const day = await this.turns.count({ where: { accountId, createdAt: MoreThan(new Date(now.getTime() - DAY_MS)) } });
    if (day >= llmCallsPerDay) {
      return { reason: `Лимит вызовов модели в сутки (${llmCallsPerDay}) исчерпан`, retryMs: RETRY_HOUR_WINDOW_MS };
    }
    return null;
  }

  /** Сообщения бота: в этот чат за сутки и по всему аккаунту за час. */
  async botMessages(chat: TelegramChatEntity, settings: AiAccountSettingsEntity, now: Date): Promise<LimitHit | null> {
    const { botMessagesPerChatPerDay, botMessagesPerHour } = settings.limits;
    const perChat = await this.messages.count({
      where: { chatId: chat.id, direction: 'out', aiTurnId: Not(IsNull()), sentAt: MoreThan(new Date(now.getTime() - DAY_MS)) },
    });
    if (perChat >= botMessagesPerChatPerDay) {
      return {
        reason: `Лимит сообщений бота в чат за сутки (${botMessagesPerChatPerDay}) исчерпан`,
        retryMs: RETRY_DAY_WINDOW_MS,
      };
    }
    const perHour = await this.messages
      .createQueryBuilder('m')
      .innerJoin(TelegramChatEntity, 'c', 'c.id = m.chatId')
      .where('c.accountId = :accountId', { accountId: chat.accountId })
      .andWhere('m.direction = :direction', { direction: 'out' })
      .andWhere('m.aiTurnId IS NOT NULL')
      .andWhere('m.sentAt > :since', { since: new Date(now.getTime() - HOUR_MS) })
      .getCount();
    if (perHour >= botMessagesPerHour) {
      return {
        reason: `Лимит сообщений бота по аккаунту в час (${botMessagesPerHour}) исчерпан`,
        retryMs: RETRY_HOUR_WINDOW_MS,
      };
    }
    return null;
  }
}
