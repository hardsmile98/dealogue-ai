import { Injectable, Logger } from '@nestjs/common';
import type { Channel } from '../core/channel.js';
import { HISTORY_LIMIT } from '../core/history.js';
import { LADDER_KINDS, nextLadderStep } from '../core/ladder.js';
import type { LadderStep } from '../core/ladder.js';
import type { JobKind } from '../core/types.js';
import type { BotChatStateEntity } from '../entities/bot-chat-state.entity.js';
import { stageFromMilestones } from '../library/kinds.js';
import { BotChatStateRepository } from '../repositories/bot-chat-state.repository.js';
import { BotJobsRepository } from '../repositories/bot-jobs.repository.js';
import { BotMemoryRepository } from '../repositories/bot-memory.repository.js';
import { BotSettingsService } from './bot-settings.service.js';

/** Ступень считается созревшей с небольшим запасом: поллер забирает задания раз в несколько секунд. */
const DUE_TOLERANCE_MS = 60_000;

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
    const next = await this.compute(state, channel);
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

  /**
   * Нужна ли ступень `kind` сейчас: лестница по текущему состоянию выводит
   * её же, и она уже созрела. Задание могло устареть, пока ждало: клиент
   * ответил, а повтор упавшего напоминания пересчёт лестницы не снимает.
   */
  async stillDue(
    chatId: string,
    channel: Channel,
    kind: JobKind,
    now: Date,
  ): Promise<boolean> {
    const state = await this.states.find(chatId);
    if (!state || state.mode !== 'auto') return false;
    const step = await this.compute(state, channel);
    return (
      step !== null &&
      step.kind === kind &&
      step.runAt.getTime() <= now.getTime() + DUE_TOLERANCE_MS
    );
  }

  /** Следующая ступень по текущему состоянию чата — без записи в базу. */
  private async compute(
    state: BotChatStateEntity,
    channel: Channel,
  ): Promise<LadderStep | null> {
    const [agent, memory, history] = await Promise.all([
      this.settings.agentSwitch(state.accountId),
      this.memories.load(state),
      channel.history(state.chatId, HISTORY_LIMIT),
    ]);
    return nextLadderStep({
      chatId: state.chatId,
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
  }
}
