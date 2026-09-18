import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeService } from '../../../realtime/realtime.service.js';
import type { TouchKind } from '../../domain/types.js';
import { AiDraftEntity } from '../../entities/ai-draft.entity.js';
import type { AiChatStateEntity } from '../../entities/ai-chat-state.entity.js';
import { AiJobsService } from '../../jobs/ai-jobs.service.js';
import { AiSettingsService } from '../../settings/ai-settings.service.js';
import { isOpen } from '../drafts/draft-decision.js';
import { pickInterval } from '../funnel/touch-planner.js';
import { defaultRng } from '../lib/random.js';
import type { Rng } from '../lib/random.js';
import { ChatStateService } from './chat-state.service.js';

const HOUR_MS = 3_600_000;

/**
 * Касания по таймеру (раздел 5.4 ТЗ): постановка в очередь, перенос на
 * следующий интервал и таймаут подтверждения в режиме supervised. Что именно
 * за касание и когда — решает `touch-planner`, здесь только очередь и
 * состояние чата.
 */
@Injectable()
export class TouchSchedulerService {
  constructor(
    @InjectRepository(AiDraftEntity)
    private readonly drafts: Repository<AiDraftEntity>,
    private readonly settings: AiSettingsService,
    private readonly chatState: ChatStateService,
    private readonly jobs: AiJobsService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Ставит касание в очередь на указанное время; возвращает его же. */
  async schedule(state: AiChatStateEntity, kind: TouchKind, at: Date): Promise<Date> {
    await this.jobs.enqueue({ type: 'touch', accountId: state.accountId, chatId: state.chatId, runAt: at, payload: { kind } });
    return at;
  }

  /**
   * Ход-касание ушёл на подтверждение менеджеру: если он не успеет к сроку,
   * вернёмся сюда и перенесём касание на следующий интервал.
   */
  async scheduleSuperviseTimeout(state: AiChatStateEntity, kind: TouchKind, draftId: string, at: Date): Promise<void> {
    await this.jobs.enqueue({
      type: 'touch',
      accountId: state.accountId,
      chatId: state.chatId,
      runAt: at,
      payload: { kind, superviseTimeout: true, draftId },
    });
  }

  /**
   * Касание не состоялось (таймаут подтверждения или менеджер отклонил ход) —
   * переносим его на новый интервал, чтобы воронка не замирала.
   */
  async postpone(
    state: AiChatStateEntity,
    kind: TouchKind,
    reason: string,
    extra: Record<string, unknown> = {},
    rng: Rng = defaultRng,
  ): Promise<Date> {
    const settings = await this.settings.get(state.accountId);
    const hours = pickInterval({ timings: settings.timings, lastIntervalHours: lastInterval(state), rng });
    const at = await this.schedule(state, kind, new Date(Date.now() + hours * HOUR_MS));
    await this.chatState.apply(state, { nextTouchKind: kind, nextTouchAt: at, lastIntervalHours: String(hours) });
    await this.chatState.recordEvent(state.accountId, state.chatId, 'touch_scheduled', { kind, at: at.toISOString(), reason, ...extra });
    await this.chatState.publishFunnel(state);
    return at;
  }

  /**
   * Менеджер не подтвердил ход-касание в supervised за отведённое время:
   * черновик устаревает, касание переносится на следующий интервал (раздел 8.4 ТЗ).
   */
  async superviseTimeout(accountId: string, chatId: string, draftId: string, kind: TouchKind, rng: Rng = defaultRng): Promise<string> {
    const draft = await this.drafts.findOne({ where: { id: draftId, chatId } });
    if (!draft || !isOpen(draft.status)) return 'Черновик уже решён';
    const state = await this.chatState.find(chatId);
    if (!state || state.mode !== 'supervised') return 'Чат больше не в режиме supervised';
    await this.drafts.update(draft.id, { status: 'superseded', decidedAt: new Date() });
    await this.realtime.publishForAccount(accountId, { type: 'draft.updated', accountId, chatId, draftId: draft.id, status: 'superseded' });
    const at = await this.postpone(state, kind, 'supervise_timeout', { draftId }, rng);
    return `Касание ${kind} перенесено на ${at.toISOString()}`;
  }
}

/** В базе интервал лежит строкой (numeric) — планировщику нужно число. */
export function lastInterval(state: AiChatStateEntity): number | null {
  return state.lastIntervalHours ? Number(state.lastIntervalHours) : null;
}
