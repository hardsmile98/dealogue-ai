import { Injectable } from '@nestjs/common';
import type { ClientCard, FunnelStage, HandoffReason, TouchKind, TurnTrigger } from '../../domain/types.js';
import type { AiAccountSettingsEntity } from '../../entities/ai-account-settings.entity.js';
import { AiSettingsService } from '../../settings/ai-settings.service.js';
import type { HistoryMessage } from '../agent.types.js';
import { cardToColumns, emptyCard, normalizeCard } from '../card/client-card.js';
import { slotsOf } from '../card/turn-card.js';
import { MAX_TOUCH_POSTPONES, postponedTouchAt, reengageAfterRead } from '../funnel/touch-planner.js';
import { describeViolations } from '../guard/guard.js';
import { defaultRng } from '../lib/random.js';
import { formatSimilarCases } from '../learning/similar-cases.js';
import { plan, stageAfterFinished, stageForTouch } from '../planner/planner.js';
import { stopReason } from '../planner/stop-reason.js';
import {
  addClientMessage,
  deliver,
  historyOf,
  markRead,
  recordTurn,
  setTouch,
  startState,
} from '../sandbox/sandbox-state.js';
import type {
  SimAction,
  SimEvent,
  SimRequest,
  SimResponse,
  SimStartSlots,
  SimState,
  SimTouchState,
  SimTurnInfo,
} from '../sandbox/sandbox.types.js';
import { SimilarCasesService } from './similar-cases.service.js';
import { TurnContextService } from './turn-context.service.js';
import { TurnGenerationService } from './turn-generation.service.js';

/** Похожие случаи ищутся по аккаунту; чата у песочницы нет — исключать нечего. */
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
/** За один шаг «клиент молчит» делаем не больше стольких касаний — это вызовы модели. */
const MAX_TOUCHES_PER_WAIT = 3;

/**
 * Песочница (раздел 12.1 п. 7 ТЗ): диалог с выдуманным клиентом от первого
 * сообщения до конца воронки. Каждый шаг проходит тот же путь, что настоящий
 * ход — Planner → Composer → Guard, те же плейбуки, образцы и блоки, — но
 * ничего не отправляет и не пишет в базу.
 *
 * Время в песочнице виртуальное: шаг «клиент молчит N часов» двигает часы и
 * выполняет касания, срок которых наступил, — так видно поведение бота в
 * тишине, не дожидаясь суток. Состояние диалога хранит клиент и присылает
 * его в каждом запросе, поэтому сервер между шагами ничего не помнит:
 * перезапуск API не роняет сценарий, а «очистить» — забыть состояние.
 *
 * Чего в песочнице нет: отправки в Telegram, дебаунса и задержек набора,
 * лимитов на вызовы модели и сообщения (они считаются по настоящим ходам) и
 * режима supervised — подтверждать здесь нечего.
 */
@Injectable()
export class SandboxService {
  constructor(
    private readonly settings: AiSettingsService,
    private readonly context: TurnContextService,
    private readonly similar: SimilarCasesService,
    private readonly generation: TurnGenerationService,
  ) {}

  async run(accountId: string, request: SimRequest): Promise<SimResponse> {
    const settings = await this.settings.get(accountId);
    const action = request.action;
    if (action.kind === 'start') return this.start(settings, action);

    const state = clone(request.state);
    if (!state) return this.start(settings, { kind: 'start' });

    switch (action.kind) {
      case 'client':
        return this.onClient(accountId, settings, state, action.text.trim());
      case 'wait':
        return this.onWait(accountId, settings, state, action.minutes, action.read ?? false);
      case 'touch':
        return this.onTouch(accountId, settings, state, action.touchKind ?? null);
      case 'resume':
        return this.onResume(state);
    }
  }

  // --- шаги -------------------------------------------------------------------

  private start(settings: AiAccountSettingsEntity, action: Extract<SimAction, { kind: 'start' }>): SimResponse {
    const now = new Date();
    const card: ClientCard = { ...emptyCard(settings.persona.language), ...known(action.slots) };
    const state = startState(now, action.stage ?? 'greeting', normalizeCard(card, settings.persona.language, now));
    return {
      state,
      events: [note(now, 'Новый диалог. Напишите первое сообщение от лица клиента — бот ответит так же, как ответил бы в чате.')],
    };
  }

  /** Клиент написал: ход по входящему, как после дебаунса в настоящем чате. */
  private async onClient(
    accountId: string,
    settings: AiAccountSettingsEntity,
    state: SimState,
    text: string,
  ): Promise<SimResponse> {
    const now = new Date(state.now);
    const message = addClientMessage(state, text, now);
    const events: SimEvent[] = [{ kind: 'client', at: state.now, text }];
    if (state.handoff) {
      events.push(note(now, 'Чат передан менеджеру — бот молчит, отвечает человек. Вернуть диалог боту можно кнопкой «Вернуть боту».'));
      return { state, events };
    }
    const turn = await this.runTurn(accountId, settings, state, { trigger: 'inbound', touchKind: null, batch: [message] });
    return { state, events: [...events, ...turn] };
  }

  /** Клиент молчит: двигаем часы и выполняем касания, срок которых наступил. */
  private async onWait(
    accountId: string,
    settings: AiAccountSettingsEntity,
    state: SimState,
    minutes: number,
    read: boolean,
  ): Promise<SimResponse> {
    const from = new Date(state.now);
    const until = new Date(from.getTime() + minutes * 60_000);
    const events: SimEvent[] = [note(from, `Клиент молчит ${humanMinutes(minutes)}${read ? ' — сообщения прочитал, но не ответил' : ''}.`)];

    // Диагностику прочитали — вопрос-возврат переносится на «через час после прочтения».
    if (read && markRead(state, from) && state.nextTouchKind === 'reengage') {
      const at = reengageAfterRead(from, settings.timings, defaultRng);
      if (!state.nextTouchAt || at < new Date(state.nextTouchAt)) {
        setTouch(state, 'reengage', at);
        events.push(touchEvent(from, 'reengage', at, 'postponed'));
      }
    }

    let fired = 0;
    while (state.nextTouchAt && state.nextTouchKind && new Date(state.nextTouchAt) <= until) {
      if (fired >= MAX_TOUCHES_PER_WAIT) {
        events.push(note(new Date(state.now), `За один шаг песочница делает не больше ${MAX_TOUCHES_PER_WAIT} касаний — промотайте время ещё раз.`));
        return { state, events };
      }
      const at = new Date(state.nextTouchAt);
      const kind = state.nextTouchKind;
      state.now = at.toISOString();
      events.push(touchEvent(at, kind, null, 'fired'));
      events.push(...(await this.runTurn(accountId, settings, state, { trigger: 'touch', touchKind: kind, batch: [] })));
      fired += 1;
      if (state.handoff) break;
    }

    if (new Date(state.now) < until) state.now = until.toISOString();
    if (fired === 0 && !state.handoff) events.push(note(until, 'Бот за это время ничего не написал.'));
    return { state, events };
  }

  /** Ход по кнопке менеджера: «сделать касание сейчас» или «следующий шаг». */
  private async onTouch(
    accountId: string,
    settings: AiAccountSettingsEntity,
    state: SimState,
    touchKind: TouchKind | null,
  ): Promise<SimResponse> {
    const now = new Date(state.now);
    if (state.handoff) {
      return { state, events: [note(now, 'Чат передан менеджеру — бот не ходит. Сначала верните диалог боту.')] };
    }
    const events: SimEvent[] = [
      touchKind ? touchEvent(now, touchKind, null, 'fired') : note(now, 'Менеджер попросил сделать следующий шаг по этапу.'),
    ];
    events.push(...(await this.runTurn(accountId, settings, state, { trigger: 'manual', touchKind, batch: [] })));
    return { state, events };
  }

  private onResume(state: SimState): SimResponse {
    const now = new Date(state.now);
    if (!state.handoff) return { state, events: [note(now, 'Чат и так ведёт бот.')] };
    state.handoff = null;
    state.touchPostponedCount = 0;
    return { state, events: [note(now, 'Диалог вернули боту — можно продолжать.')] };
  }

  // --- ход --------------------------------------------------------------------

  /**
   * Один ход агента на состоянии песочницы: то же, что `AgentService.runTurn`,
   * но без базы, отправки и лимитов. Состояние меняется на месте.
   */
  private async runTurn(
    accountId: string,
    settings: AiAccountSettingsEntity,
    state: SimState,
    input: { trigger: TurnTrigger; touchKind: TouchKind | null; batch: HistoryMessage[] },
  ): Promise<SimEvent[]> {
    const now = new Date(state.now);
    const rng = defaultRng;
    const { trigger, touchKind, batch } = input;
    const stage: FunnelStage = touchKind && trigger !== 'inbound' ? stageForTouch(touchKind) : state.stage;
    const card = normalizeCard(state.card, settings.persona.language, now);
    const slots = slotsOf(card, [], now);
    const history = historyOf(state.messages).slice(0, state.messages.length - batch.length);

    const ctx = await this.context.load({
      accountId,
      stage,
      touchKind: trigger === 'inbound' ? null : touchKind,
      slots,
      usedExampleIds: state.usedExampleIds,
      sentBlockIds: state.sentBlockIds,
      accountLanguage: settings.persona.language,
      rng,
    });

    const verdict = plan({
      trigger,
      touchKind: trigger === 'inbound' ? null : touchKind,
      mode: 'auto',
      stage,
      playbook: ctx.playbook,
      slots,
      batch,
      history,
      isMinor: cardToColumns(card, now).isMinor,
      autoMessagesSinceClient: state.autoMessagesSinceClient,
      remindersSent: state.remindersSent,
      diagnosticsSentAt: date(state.diagnosticsSentAt),
      diagnosticsReadAt: date(state.diagnosticsReadAt),
      lastClientMessageAt: date(state.lastClientMessageAt),
      limits: settings.limits,
      blocks: ctx.blocks,
      exhaustedBlockKinds: ctx.exhaustedBlockKinds,
      recentTurns: state.turns,
      now,
    });

    if (verdict.kind === 'skip') {
      const events: SimEvent[] = [{ kind: 'skip', at: state.now, text: skipText(verdict.detail) }];
      if (trigger !== 'inbound') {
        setTouch(state, null, null);
        events.push(touchEvent(now, null, null, 'dropped'));
      }
      return events;
    }
    if (verdict.kind === 'handoff') return [this.handoff(state, verdict.reason, verdict.detail, null)];

    const task = verdict.task;
    const cases =
      batch.length > 0
        ? await this.similar.find({
            accountId,
            chatId: ZERO_UUID,
            texts: batch.map((m) => m.text),
            stage,
            categoryKey: slots.requestCategoryKey,
          })
        : [];

    const gen = await this.generation.generate({
      system: { persona: settings.persona, facts: ctx.facts, stages: ctx.stages, categories: ctx.categories },
      turn: {
        task,
        playbook: ctx.playbook,
        examples: ctx.examples,
        blocks: ctx.blocks,
        history,
        batch,
        card,
        age: slots.age,
        manualSlots: [],
        peer: { name: null, username: null },
        notes: ctx.notes,
        similarCases: formatSimilarCases(cases),
        now,
      },
      guard: {
        sentBlockIds: state.sentBlockIds,
        exhaustedBlockKinds: ctx.exhaustedBlockKinds,
        pastBotMessages: history.filter((m) => m.role === 'bot').map((m) => m.text),
        greetedToday: Boolean(state.lastGreetingAt && sameDay(new Date(state.lastGreetingAt), now)),
        config: settings.guard,
      },
      task,
      blockPools: ctx.blockPools,
      facts: ctx.facts,
      personaLinks: settings.persona.links,
      accountLanguage: ctx.accountLanguage,
    });

    // Карточку модель ведёт сама — записываем её до стоп-триггеров, как в настоящем ходе.
    state.card = gen.card;
    const stageAfter = stageAfterFinished({
      stage,
      trigger,
      touchKind,
      progress: gen.output.analysis.stageProgress,
      birthKnown: Boolean(gen.card.birthDate || gen.card.birthDateText),
      requestKnown: Boolean(gen.card.requestSummary),
      hasDiscountBlock: ctx.hasDiscountBlock,
      remindersSent: state.remindersSent,
      maxReminders: settings.timings.maxReminders,
    });
    const info = (after: FunnelStage): SimTurnInfo => ({
      trigger,
      touchKind: trigger === 'inbound' ? null : touchKind,
      stageBefore: stage,
      stageAfter: after,
      task: task.text,
      analysis: { ...gen.output.analysis, cardChanges: gen.cardChanges } as unknown as Record<string, unknown>,
      guardNotes: gen.guardNotes as unknown as Record<string, unknown>[],
      guardOk: gen.guardOk,
      examples: ctx.examples.map((e) => ({ kind: e.kind, title: e.title })),
      blocks: gen.blocks.map((b) => ({ kind: b.kind, title: b.title })),
      similarCases: cases.map((item) => ({ source: item.source, clientText: item.clientText, answerText: item.answerText })),
      usage: { tokensIn: gen.tokensIn, tokensOut: gen.tokensOut, durationMs: gen.durationMs, model: gen.model },
      prompts: gen.prompts,
    });
    recordTurn(state, { stageBefore: stage, stageAfter, clientIntent: gen.output.analysis.clientIntent, trigger });

    const last = gen.guardNotes[gen.guardNotes.length - 1];
    const stop = stopReason({
      isMinor: cardToColumns(gen.card, now).isMinor,
      analysis: gen.output.analysis,
      language: gen.card.language,
      libraryLanguages: ctx.libraryLanguages,
      guardOk: gen.guardOk,
      guardRemark: last ? describeViolations(last.violations) : null,
      confidenceThreshold: settings.guard.confidenceThreshold,
    });
    if (stop) return [this.handoff(state, stop.reason, stop.detail, info(stage))];

    if (!gen.output.reply.send || gen.messages.length === 0) {
      return this.silent({ state, settings, now, stage, trigger, touchKind, ctx: { hasDiscountBlock: ctx.hasDiscountBlock }, reason: gen.output.reply.silentReason, turn: info(stage) });
    }

    const touch = deliver({
      state,
      now,
      stageAfter,
      trigger,
      touchKind,
      messages: gen.messages,
      diagnosticIds: gen.blocks.filter((b) => b.source === 'diagnostic').map((b) => b.id),
      exampleIds: ctx.examples.map((e) => e.id),
      hasDiscountBlock: ctx.hasDiscountBlock,
      timings: settings.timings,
      rng,
    });

    const events: SimEvent[] = [
      { kind: 'bot', at: state.now, messages: gen.messages.map((m) => ({ text: m.text, blockKind: m.blockKind })), turn: info(stageAfter) },
    ];
    if (stage !== stageAfter) events.push({ kind: 'stage', at: state.now, from: stage, to: stageAfter });
    events.push(touchEvent(now, touch?.kind ?? null, touch?.at ?? null, touch ? 'planned' : 'dropped'));
    return events;
  }

  /** Чат уходит менеджеру: бот замолкает, касания сняты (раздел 8.1 ТЗ). */
  private handoff(state: SimState, reason: HandoffReason, detail: string, turn: SimTurnInfo | null): SimEvent {
    state.handoff = { reason, detail, at: state.now };
    setTouch(state, null, null);
    return { kind: 'handoff', at: state.now, reason, text: detail, turn };
  }

  /**
   * Модель решила промолчать. У касания это значит «сейчас неуместно» —
   * переносим, но не бесконечно: после двух переносов идём дальше по воронке.
   */
  private silent(input: {
    state: SimState;
    settings: AiAccountSettingsEntity;
    now: Date;
    stage: FunnelStage;
    trigger: TurnTrigger;
    touchKind: TouchKind | null;
    ctx: { hasDiscountBlock: boolean };
    reason: string | null;
    turn: SimTurnInfo;
  }): SimEvent[] {
    const { state, settings, now, stage, trigger, touchKind } = input;
    const events: SimEvent[] = [{ kind: 'silent', at: state.now, text: input.reason ?? 'Модель решила промолчать', turn: input.turn }];
    if (trigger === 'inbound' || !touchKind) return events;

    state.touchPostponedCount += 1;
    if (state.touchPostponedCount <= MAX_TOUCH_POSTPONES) {
      const at = postponedTouchAt(touchKind, { timings: settings.timings, lastIntervalHours: state.lastIntervalHours, now, rng: defaultRng });
      setTouch(state, touchKind, at);
      events.push(touchEvent(now, touchKind, at, 'postponed'));
      return events;
    }

    // Дважды переносили — считаем касание выполненным и идём дальше по воронке.
    state.touchPostponedCount = 0;
    const stageAfter = stageAfterFinished({
      stage,
      trigger: 'touch',
      touchKind,
      progress: 'stay',
      birthKnown: Boolean(state.card.birthDate || state.card.birthDateText),
      requestKnown: Boolean(state.card.requestSummary),
      hasDiscountBlock: input.ctx.hasDiscountBlock,
      remindersSent: state.remindersSent,
      maxReminders: settings.timings.maxReminders,
    });
    const next = deliver({
      state,
      now,
      stageAfter,
      trigger: 'touch',
      touchKind,
      messages: [],
      diagnosticIds: [],
      exampleIds: [],
      hasDiscountBlock: input.ctx.hasDiscountBlock,
      timings: settings.timings,
      rng: defaultRng,
    });
    events.push(note(now, `Касание «${touchKind}» пропущено после двух переносов — идём дальше по воронке.`));
    if (stage !== stageAfter) events.push({ kind: 'stage', at: state.now, from: stage, to: stageAfter });
    events.push(touchEvent(now, next?.kind ?? null, next?.at ?? null, next ? 'planned' : 'dropped'));
    return events;
  }
}

// --- мелочи -----------------------------------------------------------------

function clone(state: SimState | null | undefined): SimState | null {
  return state ? (JSON.parse(JSON.stringify(state)) as SimState) : null;
}

function date(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function note(at: Date, text: string): SimEvent {
  return { kind: 'note', at: at.toISOString(), text };
}

function touchEvent(at: Date, kind: TouchKind | null, touchAt: Date | null, state: SimTouchState): SimEvent {
  return { kind: 'touch', at: at.toISOString(), touchKind: kind, touchAt: touchAt ? touchAt.toISOString() : null, state };
}

function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/** «1 ч 30 мин», «2 дн. 4 ч» — понятная подпись шага «клиент молчит». */
function humanMinutes(minutes: number): string {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const parts = [days ? `${days} дн.` : '', hours ? `${hours} ч` : '', rest ? `${rest} мин` : ''].filter(Boolean);
  return parts.join(' ') || '0 мин';
}

/** Пропуск хода: `library_incomplete:<вид>` — это про незаполненную библиотеку. */
function skipText(detail: string): string {
  const missing = detail.startsWith('library_incomplete:') ? detail.slice('library_incomplete:'.length) : null;
  return missing ? `Шаг пропущен: в библиотеке нет включённого блока «${missing}».` : `Шаг пропущен: ${detail}`;
}

/** Слоты старта: пустые поля — «не знаем», их в карточку не пишем. */
function known(slots: SimStartSlots | null | undefined): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(slots ?? {})) {
    if (value !== null && value !== undefined && value !== '') result[key] = value;
  }
  return result;
}
