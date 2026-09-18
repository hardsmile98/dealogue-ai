import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RealtimeService } from '../../../realtime/realtime.service.js';
import type { TelegramChatEntity } from '../../../telegram/entities/telegram-chat.entity.js';
import type { FunnelStage, TouchKind, TurnTrigger } from '../../domain/types.js';
import { AiDiagnosticEntity } from '../../entities/ai-diagnostic.entity.js';
import { AiPhraseEntity } from '../../entities/ai-phrase.entity.js';
import { AiTurnEntity } from '../../entities/ai-turn.entity.js';
import type { TurnMessage } from '../../entities/ai-turn.entity.js';
import type { AiAccountSettingsEntity } from '../../entities/ai-account-settings.entity.js';
import type { AiChatStateEntity } from '../../entities/ai-chat-state.entity.js';
import { AiJobsService } from '../../jobs/ai-jobs.service.js';
import { planNextTouch } from '../funnel/touch-planner.js';
import { defaultRng } from '../lib/random.js';
import type { Rng } from '../lib/random.js';
import { startsWithGreeting } from '../lib/slots.js';
import { stageAfterTurn } from '../planner/planner.js';
import { ChatStateService } from './chat-state.service.js';
import { TouchSchedulerService, lastInterval } from './touch-scheduler.service.js';
import type { TurnLibraryRefs } from './turn-context.service.js';

/** Что нужно, чтобы закрыть ход после отправки (или сухого прогона). */
export interface FinishTurnParams {
  chat: TelegramChatEntity;
  state: AiChatStateEntity;
  settings: AiAccountSettingsEntity;
  refs: TurnLibraryRefs;
  turn: AiTurnEntity;
  /** Что реально ушло; пусто — сухой прогон, тогда считаем по `planned`. */
  sent: TurnMessage[];
  planned: TurnMessage[];
  stageBefore: FunnelStage;
  stageAfter: FunnelStage;
  trigger: TurnTrigger;
  touchKind: TouchKind | null;
  now: Date;
  extraPatch?: Partial<AiChatStateEntity>;
  /** Клиент написал во время отправки — следующее касание не планируем. */
  interrupted?: boolean;
  rng?: Rng;
}

export interface StageAfterParams {
  state: AiChatStateEntity;
  stage: FunnelStage;
  trigger: TurnTrigger;
  touchKind: TouchKind | null;
  progress: string;
  requestKnown: boolean;
  hasDiscountBlock: boolean;
  settings: AiAccountSettingsEntity;
}

/**
 * Закрытие хода: этап, счётчики, следующее касание, события и счётчик
 * отправок по библиотеке. Вызывается и после настоящей отправки, и после
 * сухого прогона, и когда менеджер подтвердил ход под контролем.
 */
@Injectable()
export class TurnFinalizerService {
  constructor(
    @InjectRepository(AiTurnEntity)
    private readonly turns: Repository<AiTurnEntity>,
    @InjectRepository(AiPhraseEntity)
    private readonly phrases: Repository<AiPhraseEntity>,
    @InjectRepository(AiDiagnosticEntity)
    private readonly diagnostics: Repository<AiDiagnosticEntity>,
    private readonly chatState: ChatStateService,
    private readonly touches: TouchSchedulerService,
    private readonly jobs: AiJobsService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Этап после хода: решение модели плюс структурные правила (раздел 5.2 ТЗ). */
  stageAfter(params: StageAfterParams): FunnelStage {
    const { state, stage, trigger, touchKind, settings } = params;
    const after = stageAfterTurn(stage, trigger, trigger === 'inbound' ? null : touchKind, params.progress, {
      birthKnown: Boolean(state.birthDate || state.birthDateText),
      requestKnown: params.requestKnown,
      hasDiscountBlock: params.hasDiscountBlock,
    });
    // Последнее напоминание из отведённых — дальше только тишина.
    if (trigger !== 'inbound' && touchKind === 'reminder' && state.remindersSent + 1 >= settings.timings.maxReminders) {
      return 'closed_silent';
    }
    return after;
  }

  async finish(params: FinishTurnParams): Promise<void> {
    const { chat, state, settings, refs, turn, sent, planned, stageBefore, stageAfter, trigger, touchKind, now } = params;
    const rng = params.rng ?? defaultRng;
    const extraPatch = params.extraPatch ?? {};
    const interrupted = params.interrupted ?? false;
    const isTouch = trigger === 'touch' || (trigger === 'manual' && touchKind !== null);
    const delivered = sent.length > 0 ? sent : planned;
    const blockIds = delivered.map((m) => m.blockId).filter((id): id is string => Boolean(id));
    const sentDiagnosticId = refs.diagnosticIds.find((id) => blockIds.includes(id)) ?? null;
    const greeted = delivered.some((m) => startsWithGreeting(m.text));

    const patch: Partial<AiChatStateEntity> = {
      ...extraPatch,
      stage: stageAfter,
      ...(stageAfter !== state.stage ? { stageEnteredAt: now } : {}),
      lastBotMessageAt: now,
      autoMessagesSinceClient: isTouch ? state.autoMessagesSinceClient : (extraPatch.autoMessagesSinceClient ?? state.autoMessagesSinceClient) + 1,
      sentBlockIds: [...new Set([...state.sentBlockIds, ...blockIds])],
      usedExampleIds: [...new Set([...state.usedExampleIds, ...refs.exampleIds])].slice(-200),
      ...(greeted ? { lastGreetingAt: now } : {}),
      ...(sentDiagnosticId ? { diagnosticsTemplateId: sentDiagnosticId, diagnosticsSentAt: now, diagnosticsReadAt: null } : {}),
      ...(isTouch && touchKind === 'reminder' ? { remindersSent: state.remindersSent + 1 } : {}),
      ...(stageAfter === 'closed_silent' ? { closedAt: now } : {}),
      touchPostponedCount: 0,
    };

    // Следующее касание — от момента отправки; входящее во время отправки обработает inbound-job.
    const nextTouch = interrupted
      ? null
      : planNextTouch({
          stage: stageAfter,
          trigger,
          touchKind: isTouch ? touchKind : null,
          birthKnown: Boolean(state.birthDate || state.birthDateText),
          remindersSent: patch.remindersSent ?? state.remindersSent,
          lastIntervalHours: lastInterval(state),
          diagnosticsReadAt: state.diagnosticsReadAt,
          hasDiscountBlock: refs.hasDiscountBlock,
          timings: settings.timings,
          now,
          rng,
        });
    const touchAt = nextTouch ? await this.touches.schedule(state, nextTouch.kind, nextTouch.at) : null;
    patch.nextTouchKind = nextTouch?.kind ?? null;
    patch.nextTouchAt = touchAt;
    if (nextTouch?.intervalHours) patch.lastIntervalHours = String(nextTouch.intervalHours);

    await this.chatState.apply(state, patch);
    if (stageBefore !== stageAfter) {
      await this.chatState.recordEvent(chat.accountId, chat.id, 'stage_changed', { from: stageBefore, to: stageAfter, turnId: turn.id });
    }
    if (nextTouch && touchAt) {
      await this.chatState.recordEvent(chat.accountId, chat.id, 'touch_scheduled', { kind: nextTouch.kind, at: touchAt.toISOString(), turnId: turn.id });
    } else {
      await this.jobs.cancel('touch', chat.accountId, chat.id);
    }
    const libraryIds = await this.bumpCounters(refs, blockIds);
    await this.turns.update(turn.id, { libraryIds, ...(sent.length > 0 ? { messagesSent: sent } : {}) });
    await this.chatState.publishFunnel(state);
    await this.realtime.publishForAccount(chat.accountId, { type: 'turn.sent', accountId: chat.accountId, chatId: chat.id, turnId: turn.id });
  }

  /** Счётчик отправок примеров, блоков и диагностик; возвращает их id для счётчика ответов. */
  private async bumpCounters(refs: TurnLibraryRefs, blockIds: string[]): Promise<string[]> {
    const phraseIds = [...refs.exampleIds, ...refs.phraseBlockIds.filter((id) => blockIds.includes(id))];
    const diagnosticIds = refs.diagnosticIds.filter((id) => blockIds.includes(id));
    if (phraseIds.length > 0) await this.phrases.increment({ id: In(phraseIds) }, 'sentCount', 1).catch(() => undefined);
    if (diagnosticIds.length > 0) await this.diagnostics.increment({ id: In(diagnosticIds) }, 'sentCount', 1).catch(() => undefined);
    return [...phraseIds, ...diagnosticIds];
  }
}
