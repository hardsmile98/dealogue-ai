import { Injectable, Logger } from '@nestjs/common';
import type { Channel } from '../core/channel.js';
import { HISTORY_LIMIT } from '../core/history.js';
import { LADDER_KINDS, nextLadderStep } from '../core/ladder.js';
import type { LadderStep } from '../core/ladder.js';
import type { JobKind } from '../core/types.js';
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
  private readonly logger = new Logger(BotLadderService.name);

  constructor(
    private readonly settings: BotSettingsService,
    private readonly states: BotChatStateRepository,
    private readonly memories: BotMemoryRepository,
    private readonly jobs: BotJobsRepository,
  ) {}

  /**
   * `rejected` — задание, которое план только что закрыл как неактуальное.
   * Если лестница выводит его же и оно уже созрело, оно не ставится: иначе
   * расхождение лестницы и плана крутило бы пустые ходы по кругу.
   */
  async reschedule(
    chatId: string,
    channel: Channel,
    rejected?: { kind: JobKind; now: Date },
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
    const next = nextLadderStep({
      chatId,
      stage: stageFromMilestones(
        memory.said
          .filter((entry) => entry.kind === 'milestone')
          .map((entry) => entry.key),
      ),
      said: memory.said,
      history,
      lastHandledMessageId: state.lastHandledMessageId,
      remindersSent: state.remindersSent,
      timings: agent.timings,
    });
    const step =
      next &&
      rejected &&
      next.kind === rejected.kind &&
      next.runAt <= rejected.now
        ? null
        : next;
    if (next && !step) {
      this.logger.warn(
        `Чат ${chatId}: ступень «${next.kind}» только что отклонена планом — не ставим заново`,
      );
    }
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
