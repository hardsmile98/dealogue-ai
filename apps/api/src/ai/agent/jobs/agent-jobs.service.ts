import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AiConfig } from '../../ai.config.js';
import type { TouchKind } from '../../domain/types.js';
import { AiJobWorker } from '../../services/ai-job-worker.service.js';
import type { JobContext, JobOutcome } from '../../services/ai-job-worker.service.js';
import { AiSettingsService } from '../../services/ai-settings.service.js';
import { defaultRng } from '../lib/random.js';
import { firstReplyDelayMs } from '../outbound/timing.js';
import { AgentService } from '../services/agent.service.js';
import type { TurnRunResult } from '../services/agent.service.js';
import { ChatStateService } from '../services/chat-state.service.js';

const RESUME_RETRY_MS = 60_000;

/**
 * Обработчики job'ов `inbound` и `touch`: связывают очередь с ходом агента.
 * Первый ответ лиду задерживается на 45–150 с (раздел 5.4 ТЗ).
 */
@Injectable()
export class AgentJobsService implements OnModuleInit {
  private readonly logger = new Logger(AgentJobsService.name);

  constructor(
    private readonly worker: AiJobWorker,
    private readonly agent: AgentService,
    private readonly settings: AiSettingsService,
    private readonly chatState: ChatStateService,
    private readonly config: AiConfig,
  ) {}

  onModuleInit(): void {
    this.worker.register('inbound', (ctx) => this.handleInbound(ctx));
    this.worker.register('touch', (ctx) => this.handleTouch(ctx));
  }

  async handleInbound(ctx: JobContext): Promise<JobOutcome> {
    const { job } = ctx;
    if (!job.chatId) return { kind: 'done' };
    if (job.payload.cancelled === true) return { kind: 'cancelled' };

    const resume = resumeOf(job.payload);
    if (!resume && job.payload.delayed !== true) {
      const state = await this.chatState.find(job.chatId);
      if (state && state.stage === 'greeting' && !state.lastBotMessageAt && (state.mode === 'auto' || state.mode === 'supervised')) {
        const settings = await this.settings.get(job.accountId);
        const delay = this.config.humanDelays ? firstReplyDelayMs(settings.timings, defaultRng) : 0;
        if (delay > 0) {
          return { kind: 'postpone', runAt: new Date(Date.now() + delay), reason: 'Задержка первого ответа лиду', payload: { delayed: true } };
        }
      }
    }

    const result = await this.agent.runTurn({
      accountId: job.accountId,
      chatId: job.chatId,
      trigger: 'inbound',
      touchKind: null,
      attempt: { current: job.attempts, max: job.maxAttempts },
      resume,
      onProgress: async (patch) => {
        await ctx.heartbeat(patch);
      },
    });
    return this.toOutcome(result, job.chatId);
  }

  async handleTouch(ctx: JobContext): Promise<JobOutcome> {
    const { job } = ctx;
    if (!job.chatId) return { kind: 'done' };
    if (job.payload.cancelled === true) return { kind: 'cancelled' };
    const kind = job.payload.kind as TouchKind | undefined;
    const manual = job.payload.manual === true;
    const resume = resumeOf(job.payload);
    if (job.payload.superviseTimeout === true && kind && typeof job.payload.draftId === 'string') {
      const detail = await this.agent.superviseTimeout(job.accountId, job.chatId, job.payload.draftId, kind);
      this.logger.log(`Чат ${job.chatId}: таймаут подтверждения — ${detail}`);
      return { kind: 'done' };
    }
    if (!kind && !resume && !manual) return { kind: 'done' };

    const result = await this.agent.runTurn({
      accountId: job.accountId,
      chatId: job.chatId,
      trigger: manual ? 'manual' : 'touch',
      touchKind: kind ?? null,
      attempt: { current: job.attempts, max: job.maxAttempts },
      resume,
      onProgress: async (patch) => {
        await ctx.heartbeat(patch);
      },
    });
    return this.toOutcome(result, job.chatId);
  }

  private toOutcome(result: TurnRunResult, chatId: string): JobOutcome {
    switch (result.kind) {
      case 'done':
        this.logger.log(`Чат ${chatId}: ход → ${result.outcome}${result.detail ? ` (${result.detail})` : ''}`);
        return { kind: 'done' };
      case 'postpone':
        return { kind: 'postpone', runAt: result.runAt, reason: result.reason };
      case 'retry_resume':
        return {
          kind: 'retry',
          runAt: new Date(Date.now() + RESUME_RETRY_MS),
          error: result.error,
        };
      default:
        return { kind: 'done' };
    }
  }
}

function resumeOf(payload: Record<string, unknown>): { turnId: string; nextIndex: number } | null {
  if (typeof payload.resumeTurnId !== 'string') return null;
  return { turnId: payload.resumeTurnId, nextIndex: typeof payload.resumeIndex === 'number' ? payload.resumeIndex : 0 };
}
