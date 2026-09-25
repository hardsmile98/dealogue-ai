import { Injectable } from '@nestjs/common';
import { HISTORY_LIMIT, unansweredIncoming } from '../core/history.js';
import { JOB_KINDS } from '../core/types.js';
import type {
  JobKind,
  RetryState,
  TurnJob,
  TurnResult,
} from '../core/types.js';
import type { BotJobEntity } from '../entities/bot-job.entity.js';
import { BotChatStateRepository } from '../repositories/bot-chat-state.repository.js';
import { BotJobsRepository } from '../repositories/bot-jobs.repository.js';
import { TurnRunnerService } from './turn-runner.service.js';
import type { TurnEnvironment } from './turn-runner.service.js';

/** Задание из базы в форму ядра: вид из закрытого списка, состояние повторов из payload. */
export function toTurnJob(job: BotJobEntity): TurnJob | null {
  if (!(JOB_KINDS as readonly string[]).includes(job.kind)) return null;
  const turnJob: TurnJob = { id: job.id, kind: job.kind as JobKind };
  const retry = job.payload?.retry as Partial<RetryState> | undefined;
  if (
    retry &&
    typeof retry.firstFailedAt === 'string' &&
    typeof retry.attempt === 'number'
  ) {
    turnJob.retry = {
      firstFailedAt: retry.firstFailedAt,
      attempt: retry.attempt,
    };
  }
  return turnJob;
}

/**
 * Выполнение одного задания — общее для поллера (боевые чаты) и перемотки
 * песочницы. Условие ступени проверяет план хода в момент срабатывания; здесь
 * только выбор, каким ходом её выполнить.
 */
@Injectable()
export class BotJobExecutor {
  constructor(
    private readonly states: BotChatStateRepository,
    private readonly jobs: BotJobsRepository,
    private readonly runner: TurnRunnerService,
  ) {}

  async execute(
    job: BotJobEntity,
    env: TurnEnvironment,
  ): Promise<TurnResult | null> {
    const state = await this.states.find(job.chatId);
    const turnJob = toTurnJob(job);
    if (!state || state.mode !== 'auto' || !turnJob) {
      await this.jobs.cancel(job.id);
      return null;
    }

    const history = await env.channel.history(job.chatId, HISTORY_LIMIT);
    const pending = unansweredIncoming(
      history,
      state.lastHandledMessageId ?? 0,
    );
    if (pending.length > 0) {
      // Клиент написал, а ответа не было (сбой, перезапуск): вместо ступени —
      // ответ ему, а ступень входит в этот ответ как срочная.
      return this.runner.run(
        {
          chatId: job.chatId,
          accountId: state.accountId,
          trigger: 'client',
          messages: pending,
          job: turnJob,
          generationSeq: state.generationSeq + 1,
        },
        env,
      );
    }
    if (turnJob.kind === 'reply') {
      // Повторять нечего: клиенту уже ответили.
      await this.jobs.markDone(job.id);
      return null;
    }
    return this.runner.run(
      {
        chatId: job.chatId,
        accountId: state.accountId,
        trigger: 'schedule',
        messages: [],
        job: turnJob,
        generationSeq: state.generationSeq,
      },
      env,
    );
  }
}
