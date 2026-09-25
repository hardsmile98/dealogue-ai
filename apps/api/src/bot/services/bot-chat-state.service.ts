import { Injectable } from '@nestjs/common';
import type { TelegramChatEntity } from '../../telegram/entities/telegram-chat.entity.js';
import type { TelegramAccountEntity } from '../../telegram/entities/telegram-account.entity.js';
import { toBotTurnDto, toChatStateDto, toMemoryDto, toSandboxJobDto } from '../bot.types.js';
import type { ChatBotStateResponse, ChatJournalResponse, HandoffChatDto } from '../bot.types.js';
import { BotJobsRepository } from '../repositories/bot-jobs.repository.js';
import { BotMemoryRepository } from '../repositories/bot-memory.repository.js';
import { BotTurnsRepository } from '../repositories/bot-turns.repository.js';
import { BotTelegramService } from './bot-telegram.service.js';
import type { ManualChatMode } from '../dto/chat.dto.js';
import { stageFromMilestones } from '../library/kinds.js';
import { BotChatStateRepository } from '../repositories/bot-chat-state.repository.js';

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

  /** Журнал агента в чате: память, задания, ходы (с id отправленных сообщений). */
  async journal(chat: TelegramChatEntity): Promise<ChatJournalResponse> {
    const state = await this.states.find(chat.id);
    if (!state) return { journal: null };
    const [memory, jobs, turns] = await Promise.all([
      this.memories.load(state),
      this.jobs.listForChat(chat.id),
      this.turns.listRecent(chat.id, 50),
    ]);
    return { journal: { memory: toMemoryDto(state, memory), jobs: jobs.map(toSandboxJobDto), turns: turns.map(toBotTurnDto) } };
  }

  /** Список «у менеджера» по аккаунту. */
  async handoffs(account: TelegramAccountEntity): Promise<HandoffChatDto[]> {
    const rows = await this.states.handoffs(account.id);
    const milestones = await this.states.milestonesByChat(rows.map((row) => row.chat_id));
    return rows.map((row) => ({
      chatId: row.chat_id,
      peerName: row.peer_name,
      peerUsername: row.peer_username,
      stage: stageFromMilestones(milestones.get(row.chat_id) ?? []),
      label: row.label,
      handoffReason: row.handoff_reason,
      handoffAt: row.handoff_at ? new Date(row.handoff_at).toISOString() : null,
      waitingSince: row.waiting_since ? new Date(row.waiting_since).toISOString() : null,
      lastMessageAt: row.last_message_at ? new Date(row.last_message_at).toISOString() : null,
      lastMessageText: row.last_message_text,
      lastMessageDirection: row.last_message_direction,
    }));
  }

  async describe(chat: TelegramChatEntity): Promise<ChatBotStateResponse> {
    const state = await this.states.find(chat.id);
    if (!state) return { state: null };
    const milestones = await this.states.deliveredMilestones(chat.id);
    return { state: toChatStateDto(state, stageFromMilestones(milestones)) };
  }

  async setMode(chat: TelegramChatEntity, mode: ManualChatMode): Promise<ChatBotStateResponse> {
    const state = await this.states.setMode(chat.id, chat.accountId, mode);
    await this.telegram.modeChanged(chat.id, chat.accountId);
    const milestones = await this.states.deliveredMilestones(chat.id);
    return { state: toChatStateDto(state, stageFromMilestones(milestones)) };
  }
}
