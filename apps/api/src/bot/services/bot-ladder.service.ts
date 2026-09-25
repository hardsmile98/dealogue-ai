import { Injectable } from '@nestjs/common';
import type { Channel } from '../core/channel.js';
import { HISTORY_LIMIT } from '../core/history.js';
import { LADDER_KINDS, nextLadderStep } from '../core/ladder.js';
import type { LadderStep } from '../core/ladder.js';
import { stageFromMilestones } from '../library/kinds.js';
import { BotChatStateRepository } from '../repositories/bot-chat-state.repository.js';
import { BotJobsRepository } from '../repositories/bot-jobs.repository.js';
import { BotMemoryRepository } from '../repositories/bot-memory.repository.js';
import { BotSettingsService } from './bot-settings.service.js';

/**
 * Лестница молчания в базе: ожидающие ступени чата всегда равны тому, что
 * `nextLadderStep` выводит из текущего состояния. Пересчёт — после каждого
 * хода и каждого «прочитано»; так ответ клиента отменяет дальние ступени,
 * а смена этапа или прочтение ставит следующую.
 */
@Injectable()
export class BotLadderService {
  constructor(
    private readonly settings: BotSettingsService,
    private readonly states: BotChatStateRepository,
    private readonly memories: BotMemoryRepository,
    private readonly jobs: BotJobsRepository,
  ) {}

  async reschedule(
    chatId: string,
    channel: Channel,
  ): Promise<LadderStep | null> {
    const state = await this.states.find(chatId);
    if (!state) return null;
    if (state.mode !== 'auto') {
      await this.jobs.replaceLadder(chatId, LADDER_KINDS, null);
      return null;
    }
    const [agent, memory, history] = await Promise.all([
      this.settings.agentSwitch(state.accountId),
      this.memories.load(state),
      channel.history(chatId, HISTORY_LIMIT),
    ]);
    const step = nextLadderStep({
      chatId,
      stage: stageFromMilestones(
        memory.said
          .filter((entry) => entry.kind === 'milestone')
          .map((entry) => entry.key),
      ),
      card: memory.card,
      said: memory.said,
      history,
      remindersSent: state.remindersSent,
      timings: agent.timings,
    });
    await this.jobs.replaceLadder(
      chatId,
      LADDER_KINDS,
      step && {
        kind: step.kind,
        runAt: step.runAt,
        payload: { reason: step.reason },
      },
    );
    return step;
  }
}
