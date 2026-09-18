/**
 * Planner (раздел 4.1 ТЗ): детерминированная часть хода. Решает то, что
 * нельзя доверять модели: стоп-триггеры, лимиты, режим, этап после хода,
 * и формулирует для Composer задачу хода словами.
 */

import { FUNNEL_STAGES } from '../../domain/types.js';
import type { ChatMode, FunnelStage, LimitsConfig, TouchKind, TurnTrigger } from '../../domain/types.js';
import { similarity } from '../lib/similarity.js';
import type { HistoryMessage, LibraryBlock, PlannerVerdict, PlaybookSnapshot, SlotsSnapshot } from '../agent.types.js';

export interface RecentTurnSummary {
  stageBefore: FunnelStage | null;
  stageAfter: FunnelStage | null;
  clientIntent: string | null;
  trigger: TurnTrigger;
}

export interface PlannerInput {
  trigger: TurnTrigger;
  touchKind: TouchKind | null;
  mode: ChatMode;
  stage: FunnelStage;
  playbook: PlaybookSnapshot;
  slots: SlotsSnapshot;
  /** Новые входящие, на которые отвечаем (для inbound). */
  batch: HistoryMessage[];
  history: HistoryMessage[];
  isMinor: boolean;
  autoMessagesSinceClient: number;
  remindersSent: number;
  diagnosticsSentAt: Date | null;
  diagnosticsReadAt: Date | null;
  lastClientMessageAt: Date | null;
  limits: LimitsConfig;
  /** Блоки, доступные для этого хода (уже с выбранной диагностикой). */
  blocks: LibraryBlock[];
  recentTurns: RecentTurnSummary[];
  /** Блоки, которые в этом чате уже уходили, — повторно не обязательны и не разрешены. */
  exhaustedBlockKinds?: string[];
  now: Date;
}

const LOOP_TURNS = 3;
const LOOP_SIMILARITY = 0.6;

export function plan(input: PlannerInput): PlannerVerdict {
  if (input.mode === 'off') return { kind: 'skip', detail: 'Бот выключен в этом чате' };
  if (input.mode === 'manager') return { kind: 'skip', detail: 'Чат ведёт менеджер' };
  if (!input.playbook.enabled) return { kind: 'skip', detail: `Плейбук этапа ${input.stage} выключен` };

  if (input.isMinor) return { kind: 'handoff', reason: 'minor', detail: 'Клиент несовершеннолетний' };

  if (input.trigger === 'inbound') {
    const media = input.batch.filter((m) => m.mediaKind);
    if (media.length > 0) {
      return { kind: 'handoff', reason: 'media', detail: `Клиент прислал ${describeMedia(media[0].mediaKind)} — бот его не видит` };
    }
    if (isLoop(input.recentTurns)) {
      return { kind: 'handoff', reason: 'loop', detail: 'Три хода подряд без продвижения по одной и той же теме' };
    }
  }
  if (input.trigger !== 'touch' && input.autoMessagesSinceClient >= input.limits.autoMessagesWithoutReply) {
    return { kind: 'handoff', reason: 'auto_limit', detail: `Бот написал ${input.autoMessagesSinceClient} сообщений подряд без ответа клиента` };
  }
  if (input.stage === 'closed_silent' && input.trigger === 'touch') {
    return { kind: 'skip', detail: 'Воронка завершена — касаний нет' };
  }

  const required = requiredBlocks(input);
  for (const kind of required) {
    if (!input.blocks.some((b) => b.kind === kind)) {
      return { kind: 'skip', detail: `library_incomplete:${kind}` };
    }
  }

  const exhausted = new Set(input.exhaustedBlockKinds ?? []);
  const allowed = new Set<string>([...required, ...input.playbook.allowedBlockKinds].filter((kind) => !exhausted.has(kind)));
  if (input.touchKind === 'diagnostics' || input.stage === 'diagnostics') allowed.add('diagnostics');

  return {
    kind: 'proceed',
    task: {
      trigger: input.trigger,
      touchKind: input.touchKind,
      stage: input.stage,
      text: describeTask(input),
      requiredBlockKinds: required,
      allowedBlockKinds: [...allowed],
      exampleKinds: exampleKinds(input),
      noQuestions: input.playbook.noQuestions && input.touchKind !== 'diagnostics',
    },
  };
}

/** Обязательные блоки хода: плейбук плюс диагностика для касания диагностики. */
function requiredBlocks(input: PlannerInput): string[] {
  const exhausted = new Set(input.exhaustedBlockKinds ?? []);
  const kinds = new Set<string>(input.playbook.requiredBlockKinds.filter((kind) => !exhausted.has(kind)));
  if (input.touchKind === 'diagnostics' || (input.stage === 'diagnostics' && input.trigger !== 'inbound')) {
    kinds.add('diagnostics');
  }
  return [...kinds];
}

function exampleKinds(input: PlannerInput) {
  const kinds = [...input.playbook.exampleKinds];
  if (input.touchKind && !kinds.includes(input.touchKind as never)) {
    const asKind = input.touchKind as unknown as PlaybookSnapshot['exampleKinds'][number];
    if (['birth_nudge', 'reengage', 'offer', 'offer_question', 'price_question', 'discount', 'reminder'].includes(input.touchKind)) {
      kinds.unshift(asKind);
    }
  }
  return kinds;
}

/** Задача хода словами — то, что модель видит как «что сейчас нужно сделать». */
export function describeTask(input: PlannerInput): string {
  const parts: string[] = [];
  const slots = input.slots;
  const birthKnown = Boolean(slots.birthDate || slots.birthDateText);
  const missing: string[] = [];
  if (!birthKnown) missing.push('дата рождения');
  if (!slots.birthPlace) missing.push('место рождения');

  if (input.trigger === 'touch' && input.touchKind) {
    parts.push(touchTask(input.touchKind, input));
  } else if (input.trigger === 'manual') {
    parts.push(
      input.touchKind
        ? `Менеджер попросил сделать шаг «${input.touchKind}» прямо сейчас. ${touchTask(input.touchKind, input)}`
        : 'Менеджер попросил сделать следующий шаг по этапу прямо сейчас, без нового сообщения от клиента.',
    );
  } else {
    const count = input.batch.length;
    parts.push(
      count > 1
        ? `Клиент прислал ${count} сообщения подряд — отвечай на них как на одну реплику; если он поправил себя, важнее последнее.`
        : 'Клиент написал — ответь на его сообщение и веди к цели этапа.',
    );
  }

  switch (input.stage) {
    case 'greeting':
      parts.push(
        missing.length === 2
          ? 'Это первый ответ клиенту: поздоровайся и попроси дату и место рождения.'
          : missing.length === 1
            ? `Клиент уже прислал часть данных — поблагодари и попроси только ${missing[0]}.`
            : 'Дата и место рождения уже есть — поблагодари и переходи к знакомству: коротко представься и спроси, что беспокоит.',
      );
      break;
    case 'collect_birth':
      if (missing.length === 0) parts.push('Данные о рождении получены — не переспрашивай, переходи к знакомству и запросу.');
      else parts.push(`Ещё не хватает: ${missing.join(' и ')}.`);
      break;
    case 'collect_request':
      if (slots.requestSummary) parts.push(`Запрос уже понятен: «${slots.requestSummary}». Не спрашивай снова — подтверди, что понял, и двигайся дальше.`);
      else parts.push('Запрос ещё не ясен — познакомься и задай один открытый вопрос.');
      break;
    case 'ack_request':
      parts.push('Покажи, что понял ситуацию, дай ссылки блоком и скажи, что вернёшься с диагностикой.');
      break;
    case 'post_diagnostics':
      if (input.diagnosticsSentAt) {
        parts.push(
          input.diagnosticsReadAt
            ? `Диагностика отправлена ${relative(input.diagnosticsSentAt, input.now)} и прочитана ${relative(input.diagnosticsReadAt, input.now)}.`
            : `Диагностика отправлена ${relative(input.diagnosticsSentAt, input.now)}, отметки о прочтении нет.`,
        );
      }
      break;
    case 'reminders':
      parts.push(`Это напоминание ${input.remindersSent + 1} из серии — новый повод, не повторяй прошлые.`);
      break;
    default:
      break;
  }

  if (slots.requestCategoryKey) parts.push(`Категория запроса: ${slots.requestCategoryKey}.`);
  if (input.lastClientMessageAt && input.trigger !== 'inbound') {
    parts.push(`Последнее сообщение клиента было ${relative(input.lastClientMessageAt, input.now)}.`);
  }
  return parts.join(' ');
}

function touchTask(kind: TouchKind, input: PlannerInput): string {
  switch (kind) {
    case 'birth_nudge':
      return 'Клиент молчит после просьбы о дате и месте рождения. Мягко напомни один раз, без давления.';
    case 'diagnostics':
      return input.slots.requestSummary
        ? `Пора отправить диагностику. Перед блоком — короткая личная связка с запросом клиента («${input.slots.requestSummary}»), после блока — один завершающий вопрос.`
        : 'Пора отправить диагностику. Запрос клиента неизвестен — короткая нейтральная подводка, блок диагностики, завершающий вопрос.';
    case 'reengage':
      return 'Клиент прочитал диагностику и молчит. Один короткий вопрос-возврат: что откликнулось, есть ли вопросы. Без пересказа диагностики.';
    case 'offer':
      return 'Клиент не продолжил разговор после диагностики. Предложи услуги: связка с его запросом, суть по фактам, вопрос — что откликается.';
    case 'offer_question':
      return 'После предложения клиент молчит. Спроси, всё ли понятно по направлениям и что заинтересовало.';
    case 'price':
      return 'Пора назвать цены: короткая подводка и блок цен дословно.';
    case 'price_question':
      return 'После цен клиент молчит. Короткий вопрос: есть ли вопросы, что останавливает.';
    case 'discount':
      return 'Пора дать скидку: подводка и блок скидки дословно.';
    case 'reminder':
      return 'Клиент давно не отвечает. Напомни о себе новым поводом, коротко и тепло, один вопрос.';
    case 'first_reply':
      return 'Первый ответ клиенту.';
    default:
      return '';
  }
}

// --- этапы ------------------------------------------------------------------

export interface StageContext {
  birthKnown: boolean;
  requestKnown: boolean;
  hasDiscountBlock: boolean;
}

/** Следующий этап при «advance» (раздел 5.2 ТЗ). */
export function advanceStage(stage: FunnelStage, ctx: StageContext): FunnelStage {
  switch (stage) {
    case 'greeting':
      return ctx.birthKnown ? (ctx.requestKnown ? 'ack_request' : 'collect_request') : 'collect_birth';
    case 'collect_birth':
      return ctx.requestKnown ? 'ack_request' : 'collect_request';
    case 'collect_request':
      return 'ack_request';
    case 'ack_request':
      return 'ack_request';
    case 'diagnostics':
      return 'post_diagnostics';
    case 'post_diagnostics':
      return 'offer';
    case 'offer':
      return 'price';
    case 'price':
      return ctx.hasDiscountBlock ? 'discount' : 'reminders';
    case 'discount':
      return 'reminders';
    case 'reminders':
      return 'reminders';
    case 'closed_silent':
      return 'closed_silent';
    default:
      return stage;
  }
}

export function isFunnelStage(value: string): value is FunnelStage {
  return FUNNEL_STAGES.includes(value as FunnelStage);
}

/** Этап после хода: решение модели + структурные правила, которым модель не указ. */
export function stageAfterTurn(
  stage: FunnelStage,
  trigger: TurnTrigger,
  touchKind: TouchKind | null,
  progress: string,
  ctx: StageContext,
): FunnelStage {
  if (trigger === 'touch' || (trigger === 'manual' && touchKind)) {
    switch (touchKind) {
      case 'diagnostics':
        return 'post_diagnostics';
      case 'offer':
        return 'offer';
      case 'price':
        return 'price';
      case 'discount':
        return 'discount';
      case 'reminder':
        return 'reminders';
      default:
        return stage;
    }
  }

  let next = stage;
  if (progress === 'advance') {
    next = advanceStage(stage, ctx);
  } else if (progress.startsWith('jump:')) {
    const target = progress.slice(5).trim();
    if (isFunnelStage(target) && canJump(stage, target)) next = target;
  }
  // Приветствие заканчивается первым сообщением бота, что бы модель ни решила.
  if (stage === 'greeting' && next === 'greeting') next = advanceStage(stage, ctx);
  // Из collect_birth данные получены → дальше даже при «stay».
  if (stage === 'collect_birth' && next === 'collect_birth' && ctx.birthKnown) next = advanceStage(stage, ctx);
  // Из collect_request не торопим: модель могла задать уточняющий вопрос; таймер диагностики идёт и так.
  return next;
}

/** Прыжок только вперёд и только на этапы после диагностики, с этапов после неё. */
export function canJump(from: FunnelStage, to: FunnelStage): boolean {
  const fromIndex = FUNNEL_STAGES.indexOf(from);
  const toIndex = FUNNEL_STAGES.indexOf(to);
  const postDiagnostics = FUNNEL_STAGES.indexOf('post_diagnostics');
  return fromIndex >= postDiagnostics && toIndex > fromIndex && to !== 'closed_silent' && to !== 'reminders';
}

/** Этап, к которому относится касание. */
export function stageForTouch(kind: TouchKind): FunnelStage {
  switch (kind) {
    case 'first_reply':
      return 'greeting';
    case 'birth_nudge':
      return 'collect_birth';
    case 'diagnostics':
      return 'diagnostics';
    case 'reengage':
      return 'post_diagnostics';
    case 'offer':
    case 'offer_question':
      return 'offer';
    case 'price':
    case 'price_question':
      return 'price';
    case 'discount':
      return 'discount';
    case 'reminder':
      return 'reminders';
    default:
      return 'closed_silent';
  }
}

// --- внутреннее -----------------------------------------------------------------

function isLoop(turns: RecentTurnSummary[]): boolean {
  const inbound = turns.filter((t) => t.trigger === 'inbound').slice(-LOOP_TURNS);
  if (inbound.length < LOOP_TURNS) return false;
  if (inbound.some((t) => t.stageBefore !== t.stageAfter)) return false;
  const intents = inbound.map((t) => t.clientIntent ?? '');
  if (intents.some((i) => i.length < 10)) return false;
  return similarity(intents[0], intents[1]) >= LOOP_SIMILARITY && similarity(intents[1], intents[2]) >= LOOP_SIMILARITY;
}

function describeMedia(kind: string | null): string {
  switch (kind) {
    case 'voice':
      return 'голосовое сообщение';
    case 'photo':
      return 'фото';
    case 'video':
    case 'video_note':
      return 'видео';
    case 'document':
      return 'файл';
    case 'sticker':
      return 'стикер';
    default:
      return 'вложение';
  }
}

/** «2 часа назад», «вчера» — грубо, для текста задачи. */
export function relative(at: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (minutes < 2) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'вчера' : `${days} дн. назад`;
}
