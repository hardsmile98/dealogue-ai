import { Injectable } from '@nestjs/common';
import type { TelegramAccountEntity } from '../../telegram/entities/telegram-account.entity.js';
import type { TelegramChatEntity } from '../../telegram/entities/telegram-chat.entity.js';
import {
  toBotTurnDto,
  toChatStateDto,
  toHandoffChatDto,
  toMemoryDto,
  toSandboxJobDto,
} from '../bot.types.js';
import type {
  ChatBotStateResponse,
  ChatJournalResponse,
  HandoffChatDto,
} from '../bot.types.js';
import type { ManualChatMode } from '../dto/chat.dto.js';
import { stageFromMilestones } from '../library/kinds.js';
import { BotChatStateRepository } from '../repositories/bot-chat-state.repository.js';
import { BotJobsRepository } from '../repositories/bot-jobs.repository.js';
import {
  BotMemoryRepository,
  memoryOf,
} from '../repositories/bot-memory.repository.js';
import { BotTurnsRepository } from '../repositories/bot-turns.repository.js';
import { BotTelegramService } from './bot-telegram.service.js';

/** Сколько последних ходов показывает журнал чата. */
const JOURNAL_TURNS = 50;

/** Состояние агента в чате для веба и переключатель режима. */
@Injectable()
export class BotChatStateService {
  constructor(
    private readonly states: BotChatStateRepository,
    private readonly memories: BotMemoryRepository,
    private readonly jobs: BotJobsRepository,
    private readonly turns: BotTurnsRepository,
    private readonly telegram: BotTelegramService,
  ) {}

  /**
   * Журнал агента в чате: память, задания, ходы (с id отправленных
   * сообщений). Большинство чатов агент не ведёт — для них это один запрос;
   * у остальных части журнала читаются параллельно.
   */
  async journal(chat: TelegramChatEntity): Promise<ChatJournalResponse> {
    const state = await this.states.find(chat.id);
    if (!state) return { journal: null };
    const [records, jobs, turns] = await Promise.all([
      this.memories.records(chat.id),
      this.jobs.listForChat(chat.id),
      this.turns.listRecent(chat.id, JOURNAL_TURNS),
    ]);
    return {
      journal: {
        memory: toMemoryDto(state, memoryOf(state, records)),
        jobs: jobs.map(toSandboxJobDto),
        turns: turns.map(toBotTurnDto),
      },
    };
  }

  /** Список «у менеджера» по аккаунту — один запрос вместе с этапами. */
  async handoffs(account: TelegramAccountEntity): Promise<HandoffChatDto[]> {
    const rows = await this.states.handoffs(account.id);
    return rows.map((row) =>
      toHandoffChatDto(row, stageFromMilestones(row.milestones)),
    );
  }

  /** Состояние агента в чате; большинство чатов агент не ведёт — для них один запрос. */
  async describe(chat: TelegramChatEntity): Promise<ChatBotStateResponse> {
    const state = await this.states.find(chat.id);
    if (!state) return { state: null };
    const milestones = await this.states.deliveredMilestones(chat.id);
    return { state: toChatStateDto(state, stageFromMilestones(milestones)) };
  }

  async setMode(
    chat: TelegramChatEntity,
    mode: ManualChatMode,
  ): Promise<ChatBotStateResponse> {
    const state = await this.states.setMode(chat.id, chat.accountId, mode);
    const [milestones] = await Promise.all([
      this.states.deliveredMilestones(chat.id),
      this.telegram.modeChanged(chat.id, chat.accountId),
    ]);
    return { state: toChatStateDto(state, stageFromMilestones(milestones)) };
  }
}
