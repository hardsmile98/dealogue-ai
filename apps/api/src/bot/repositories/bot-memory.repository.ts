import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { execute } from '../../database/sql.js';
import { FACTS_LIMIT, readCard } from '../core/memory.js';
import type { FactsUpdate } from '../core/memory.js';
import type {
  ClientCard,
  ClientFact,
  Memory,
  SaidEntry,
} from '../core/types.js';
import { BotChatSaidEntity } from '../entities/bot-chat-said.entity.js';
import { BotChatStateEntity } from '../entities/bot-chat-state.entity.js';
import { BotClientFactEntity } from '../entities/bot-client-fact.entity.js';
import type { ChatLabel, HandoffReason } from '../library/kinds.js';

/** Факты и реестр сказанного — то, что лежит вне строки состояния чата. */
export interface MemoryRecords {
  facts: ClientFact[];
  said: SaidEntry[];
}

/** Память целиком: карточка и резюме из состояния чата плюс факты и сказанное. */
export function memoryOf(
  state: Pick<BotChatStateEntity, 'card' | 'summary'>,
  records: MemoryRecords,
): Memory {
  return {
    card: readCard(state.card),
    facts: records.facts,
    summary: state.summary,
    said: records.said,
  };
}

/** Память о клиенте в базе: карточка и резюме в состоянии чата, факты и реестр сказанного — отдельными таблицами. */
@Injectable()
export class BotMemoryRepository {
  constructor(
    @InjectRepository(BotChatStateEntity)
    private readonly states: Repository<BotChatStateEntity>,
    @InjectRepository(BotClientFactEntity)
    private readonly facts: Repository<BotClientFactEntity>,
    @InjectRepository(BotChatSaidEntity)
    private readonly said: Repository<BotChatSaidEntity>,
  ) {}

  async load(state: BotChatStateEntity): Promise<Memory> {
    return memoryOf(state, await this.records(state.chatId));
  }

  /**
   * Факты и сказанное без строки состояния — чтобы читать их параллельно с
   * ней (журнал, песочница) и собирать память через `memoryOf`.
   */
  async records(chatId: string): Promise<MemoryRecords> {
    const [facts, said] = await Promise.all([
      this.facts.find({
        where: { chatId, status: 'active' },
        order: { createdAt: 'DESC' },
        take: FACTS_LIMIT,
      }),
      this.said.find({ where: { chatId }, order: { at: 'ASC' } }),
    ]);
    return {
      facts: facts.map((fact) => ({
        id: fact.id,
        kind: fact.kind,
        text: fact.text,
        confidence: fact.confidence,
        sourceMessageId: fact.sourceMessageId,
      })),
      said: said.map((entry) => ({
        kind: entry.kind,
        key: entry.key,
        messageId: entry.messageId,
        at: entry.at,
      })),
    };
  }

  /**
   * Итог анализа: карточка, резюме, новые и устаревшие факты — одной
   * транзакцией, чтобы карточка и факты не разошлись при сбое посередине.
   */
  async saveAnalysis(
    chatId: string,
    card: ClientCard,
    summary: string,
    update: FactsUpdate,
  ): Promise<void> {
    await this.states.manager.transaction(async (manager) => {
      await execute(
        manager,
        `UPDATE bot_chat_state SET card = $2::jsonb, summary = $3::text, updated_at = now() WHERE chat_id = $1::uuid`,
        [chatId, JSON.stringify(card), summary],
      );
      if (update.superseded.length > 0) {
        await execute(
          manager,
          `UPDATE bot_client_facts SET status = 'superseded' WHERE chat_id = $1::uuid AND status = 'active' AND text = ANY($2::text[])`,
          [chatId, update.superseded],
        );
      }
      if (update.added.length > 0) {
        await manager.insert(
          BotClientFactEntity,
          update.added.map((fact) => ({
            chatId,
            kind: fact.kind,
            text: fact.text,
            confidence: fact.confidence,
            sourceMessageId: fact.sourceMessageId,
            status: 'active' as const,
          })),
        );
      }
    });
  }

  /** Сказанное ходом — все записи с одним временем. */
  addSaid(
    chatId: string,
    entries: readonly Omit<SaidEntry, 'at'>[],
    at: Date,
  ): Promise<void> {
    return this.addSaidEntries(
      chatId,
      entries.map((entry) => ({ ...entry, at })),
    );
  }

  /** Сказанное со своим временем у каждой записи — одним INSERT. */
  async addSaidEntries(
    chatId: string,
    entries: readonly SaidEntry[],
  ): Promise<void> {
    if (entries.length === 0) return;
    await this.said.insert(
      entries.map((entry) => ({
        chatId,
        kind: entry.kind,
        key: entry.key,
        messageId: entry.messageId,
        at: entry.at,
      })),
    );
  }

  /** Счётчики по итогу хода и поколение генерации. */
  async closeTurn(
    chatId: string,
    result: {
      nudged: boolean;
      reminders: number;
      lastHandledMessageId: number | null;
    },
  ): Promise<void> {
    await execute(
      this.states.manager,
      `UPDATE bot_chat_state SET
         turns_without_nudge = CASE WHEN $2::boolean THEN 0 ELSE turns_without_nudge + 1 END,
         reminders_sent = reminders_sent + $3::int,
         last_handled_message_id = GREATEST(last_handled_message_id, COALESCE($4::int, 0)),
         updated_at = now()
       WHERE chat_id = $1::uuid`,
      [chatId, result.nudged, result.reminders, result.lastHandledMessageId],
    );
  }

  async setGeneration(chatId: string, generationSeq: number): Promise<void> {
    await execute(
      this.states.manager,
      `UPDATE bot_chat_state SET generation_seq = GREATEST(generation_seq, $2::int), updated_at = now() WHERE chat_id = $1::uuid`,
      [chatId, generationSeq],
    );
  }

  /** Передача менеджеру: режим, причина, ярлык — одним UPDATE. */
  async setHandoff(
    chatId: string,
    reason: HandoffReason,
    label: ChatLabel | null,
  ): Promise<void> {
    await execute(
      this.states.manager,
      `UPDATE bot_chat_state SET mode = 'manager', handoff_reason = $2::varchar, handoff_at = now(), label = $3::varchar, updated_at = now()
       WHERE chat_id = $1::uuid`,
      [chatId, reason, label],
    );
  }
}
