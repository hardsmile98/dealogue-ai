import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { TelegramChatEntity } from '../../telegram/entities/telegram-chat.entity.js';
import { TelegramMessageEntity } from '../../telegram/entities/telegram-message.entity.js';
import { AiConfig } from '../ai.config.js';
import { accountDefaults } from '../domain/defaults.js';
import { AiAccountSettingsEntity } from '../entities/ai-account-settings.entity.js';
import { AiCategoryEntity } from '../entities/ai-category.entity.js';
import { AiChatStateEntity } from '../entities/ai-chat-state.entity.js';
import { AiDiagnosticEntity } from '../entities/ai-diagnostic.entity.js';
import { AiDraftEntity } from '../entities/ai-draft.entity.js';
import { AiEventEntity } from '../entities/ai-event.entity.js';
import { AiFactEntity } from '../entities/ai-fact.entity.js';
import { AiJobEntity } from '../entities/ai-job.entity.js';
import { AiNoteEntity } from '../entities/ai-note.entity.js';
import { AiPhraseEntity } from '../entities/ai-phrase.entity.js';
import { AiPlaybookEntity } from '../entities/ai-playbook.entity.js';
import { AiStatsDailyEntity } from '../entities/ai-stats-daily.entity.js';
import { AiTurnEntity } from '../entities/ai-turn.entity.js';
import { AlertEntity } from '../entities/alert.entity.js';
import type { AiResetCountsDto } from './ai-reset.types.js';

interface ResetResult {
  settings: AiAccountSettingsEntity;
  deleted: AiResetCountsDto;
}

/**
 * Полный сброс ИИ-агента на аккаунте: настройки возвращаются к значениям по
 * умолчанию, библиотека и все журналы агента стираются. Telegram-аккаунт, чаты
 * и переписка остаются — удаляется только то, что накопил агент.
 *
 * Всё одной транзакцией: либо аккаунт чист, либо ничего не изменилось. Бот
 * выключается в той же транзакции, поэтому новых ходов после сброса не будет;
 * ход, начатый за миг до него, может дописать свою строку — это видно в журнале.
 */
@Injectable()
export class AiResetService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: AiConfig,
    private readonly realtime: RealtimeService,
  ) {}

  async resetAccount(accountId: string, byUserId: string): Promise<ResetResult> {
    const result = await this.dataSource.transaction(async (manager) => {
      // Порядок важен: у черновика есть ссылка на ход, поэтому сначала черновики.
      const deleted: AiResetCountsDto = {
        drafts: await this.wipe(manager, AiDraftEntity, accountId),
        turns: await this.wipe(manager, AiTurnEntity, accountId),
        chatStates: await this.wipe(manager, AiChatStateEntity, accountId),
        jobs: await this.wipe(manager, AiJobEntity, accountId),
        alerts: await this.wipe(manager, AlertEntity, accountId),
        stats: await this.wipe(manager, AiStatsDailyEntity, accountId),
        events: await this.wipe(manager, AiEventEntity, accountId),
        phrases: await this.wipe(manager, AiPhraseEntity, accountId),
        facts: await this.wipe(manager, AiFactEntity, accountId),
        diagnostics: await this.wipe(manager, AiDiagnosticEntity, accountId),
        categories: await this.wipe(manager, AiCategoryEntity, accountId),
        notes: await this.wipe(manager, AiNoteEntity, accountId),
        playbooks: await this.wipe(manager, AiPlaybookEntity, accountId),
      };

      await this.clearTelegramTraces(manager, accountId);
      const settings = await this.resetSettings(manager, accountId, byUserId, deleted);
      return { settings, deleted };
    });

    await this.realtime.publishForAccount(accountId, { type: 'settings.updated', accountId });
    return result;
  }

  // --- внутреннее -----------------------------------------------------------

  /** У всех таблиц агента колонка одна и та же — `account_id`. */
  private async wipe<T extends ObjectLiteral>(
    manager: EntityManager,
    entity: EntityTarget<T>,
    accountId: string,
  ): Promise<number> {
    const result = await manager
      .createQueryBuilder()
      .delete()
      .from(entity)
      .where('account_id = :accountId', { accountId })
      .execute();
    return result.affected ?? 0;
  }

  /**
   * Следы агента в таблицах Telegram: пометка «требует внимания» (алертов,
   * которые её ставили, больше нет) и ссылка сообщения на ход. Ссылку снимаем:
   * ход удалён, а по ней чат предлагает его оценить. Прошлые сообщения бота
   * после этого неотличимы от сообщений менеджера — так и задумано, для агента
   * аккаунт начинается с чистого листа.
   */
  private async clearTelegramTraces(manager: EntityManager, accountId: string): Promise<void> {
    await manager
      .getRepository(TelegramChatEntity)
      .update({ accountId, needsAttention: true }, { needsAttention: false, attentionReason: null, attentionAt: null });

    await manager
      .getRepository(TelegramMessageEntity)
      .createQueryBuilder()
      .update()
      .set({ aiTurnId: null })
      .where('ai_turn_id IS NOT NULL')
      .andWhere('chat_id IN (SELECT id FROM telegram_chats WHERE account_id = :accountId)', { accountId })
      .execute();
  }

  /** Событие пишется последним: журнал уже пуст, и в нём остаётся след сброса. */
  private async resetSettings(
    manager: EntityManager,
    accountId: string,
    byUserId: string,
    deleted: AiResetCountsDto,
  ): Promise<AiAccountSettingsEntity> {
    const settings = manager.getRepository(AiAccountSettingsEntity);
    const row = (await settings.findOne({ where: { accountId } })) ?? settings.create({ accountId });
    const before = { enabled: row.enabled, dryRun: row.dryRun, mode: row.defaultChatMode };

    Object.assign(row, accountDefaults(this.config.defaultDryRun));
    const saved = await settings.save(row);

    const events = manager.getRepository(AiEventEntity);
    await events.save(
      events.create({
        accountId,
        chatId: null,
        kind: 'settings_changed',
        payload: { byUserId, reset: 'account', before, deleted },
      }),
    );
    return saved;
  }
}
