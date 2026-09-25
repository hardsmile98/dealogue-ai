/**
 * Справочники агента: виды элементов библиотеки, вехи воронки, категории
 * запросов. Всё, что здесь перечислено, — контракт между базой, промптами и
 * вебом; менять синхронно с apps/web/src/shared/api/contracts/bot.ts.
 * Логика описана в docs/agent-architecture.md (разделы 2 и 6).
 */

/** Вехи воронки по порядку: код отправляет их из библиотеки, LLM только обрамляет. */
export const MILESTONES = ['links', 'diagnostic', 'offer', 'prices'] as const;
export type Milestone = (typeof MILESTONES)[number];

/** Как веха называется в плане хода и в заглушках истории («[отправлена диагностика]»). */
export const MILESTONE_TITLES: Readonly<Record<Milestone, string>> = {
  links: 'ссылки и сообщение об ожидании',
  diagnostic: 'диагностика',
  offer: 'описание практик',
  prices: 'стоимость',
};

/** Этап = последняя доставленная веха; `intake` — пока ничего не доставлено. */
export const STAGES = ['intake', ...MILESTONES] as const;
export type Stage = (typeof STAGES)[number];

export function stageFromMilestones(delivered: readonly string[]): Stage {
  let stage: Stage = 'intake';
  for (const milestone of MILESTONES) {
    if (delivered.includes(milestone)) stage = milestone;
  }
  return stage;
}

/** Следующая веха после этапа; null — воронка пройдена. */
export function nextMilestone(stage: Stage): Milestone | null {
  const index = STAGES.indexOf(stage);
  return (STAGES[index + 1] as Milestone | undefined) ?? null;
}

/**
 * Виды элементов библиотеки. Тела вех (`links`, `diagnostic`, `offer`,
 * `prices`) уходят дословно; остальное — образцы тона, которые ответчик
 * пересказывает.
 */
export const LIBRARY_KINDS = [
  'greeting',
  'ask_birth_data',
  'no_birth_data',
  'ask_request',
  'empathy',
  'wait',
  'links',
  'diagnostic',
  'return_question',
  'offer',
  'prices',
  'nudge',
  'price_deflect',
  'objection',
  'about',
] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

export const MILESTONE_KINDS: readonly LibraryKind[] = MILESTONES;

export const GENDERS = ['f', 'm'] as const;
export type Gender = (typeof GENDERS)[number];

export const LANGUAGES = ['ru', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Категории возражений — плейбук (элементы вида `objection`). */
export const OBJECTION_CATEGORIES = [
  'expensive',
  'think_about_it',
  'dont_believe',
  'no_time',
  'ask_partner',
  'tried_before',
  'later',
] as const;
export type ObjectionCategory = (typeof OBJECTION_CATEGORIES)[number];

export interface RequestCategory {
  key: string;
  group:
    | 'relationships'
    | 'money'
    | 'health'
    | 'family'
    | 'universal'
    | 'future'
    | 'request'
    | 'other';
  title: string;
}

/**
 * Категории запроса клиента — по ним выбирается диагностика. Анализатор
 * относит запрос к одной из них; при сомнении — `universal.general`.
 */
export const REQUEST_CATEGORIES: readonly RequestCategory[] = [
  {
    key: 'relationships.breakup',
    group: 'relationships',
    title: 'Расставание',
  },
  {
    key: 'relationships.psych_astro',
    group: 'relationships',
    title: 'Психология и астрология',
  },
  {
    key: 'relationships.single',
    group: 'relationships',
    title: 'Нет отношений, не получается построить',
  },
  {
    key: 'relationships.ex_conflict',
    group: 'relationships',
    title: 'Бывший партнёр или конфликт',
  },
  {
    key: 'relationships.triangle',
    group: 'relationships',
    title: 'Любовный треугольник, измены',
  },
  {
    key: 'relationships.couple',
    group: 'relationships',
    title: 'Отношения в паре',
  },
  { key: 'money.love', group: 'money', title: 'Финансы и любовь' },
  { key: 'money.work', group: 'money', title: 'Финансы и работа' },
  { key: 'money.sudden_loss', group: 'money', title: 'Резкая потеря денег' },
  {
    key: 'money.instability',
    group: 'money',
    title: 'Финансовая нестабильность',
  },
  { key: 'money.more', group: 'money', title: 'Хочет больше денег' },
  { key: 'money.second_business', group: 'money', title: 'Второй бизнес' },
  {
    key: 'money.relationships',
    group: 'money',
    title: 'Финансы и отношения в паре',
  },
  { key: 'money.health', group: 'money', title: 'Финансы и здоровье' },
  { key: 'health.own', group: 'health', title: 'Здоровье' },
  { key: 'health.child', group: 'health', title: 'Здоровье ребёнка' },
  { key: 'family.child', group: 'family', title: 'Семья, ребёнок' },
  { key: 'family.childbearing', group: 'family', title: 'Деторождение' },
  { key: 'universal.general', group: 'universal', title: 'Универсальная' },
  { key: 'universal.seven_roads', group: 'universal', title: '7 дорог' },
  {
    key: 'universal.chakras',
    group: 'universal',
    title: 'Заблокированы чакры',
  },
  { key: 'future.general', group: 'future', title: 'На будущее' },
  { key: 'future.3m', group: 'future', title: 'На будущее, 3 месяца' },
  {
    key: 'request.card_reading',
    group: 'request',
    title: 'Карта и разбор по запросу',
  },
  { key: 'other.phobia_insects', group: 'other', title: 'Боязнь насекомых' },
  { key: 'other.relocation', group: 'other', title: 'Переезд' },
];

export const UNIVERSAL_CATEGORY = 'universal.general';

export const REQUEST_CATEGORY_KEYS: readonly string[] = REQUEST_CATEGORIES.map(
  (c) => c.key,
);

export function isRequestCategory(value: string): boolean {
  return REQUEST_CATEGORY_KEYS.includes(value);
}

/** Режим чата: агент ведёт сам, чат у менеджера, агент выключен в этом чате. */
export const CHAT_MODES = ['auto', 'manager', 'off'] as const;
export type ChatMode = (typeof CHAT_MODES)[number];

/** Режимы, которые владелец может выставить руками; `manager` ставит только система. */
export const MANUAL_CHAT_MODES = ['auto', 'off'] as const;

/** Ярлык чата в списке «у менеджера» (docs/agent-architecture.md, раздел 5). */
export const CHAT_LABELS = [
  'needs_reply',
  'prices_silent',
  'agent_unavailable',
] as const;
export type ChatLabel = (typeof CHAT_LABELS)[number];

/** Причины передачи менеджеру. */
export const HANDOFF_REASONS = [
  'media',
  'risk',
  'no_language_materials',
  'reply_after_prices',
  'prices_sent',
  'foreign_outgoing',
  'agent_unavailable',
] as const;
export type HandoffReason = (typeof HANDOFF_REASONS)[number];

/**
 * Ярлык, с которым чат уходит менеджеру (docs/agent-architecture.md,
 * раздел 5). Чужое исходящее — без ярлыка: менеджер уже в чате.
 */
export const HANDOFF_LABELS: Readonly<Record<HandoffReason, ChatLabel | null>> =
  {
    media: 'needs_reply',
    risk: 'needs_reply',
    no_language_materials: 'needs_reply',
    reply_after_prices: 'needs_reply',
    prices_sent: 'prices_silent',
    foreign_outgoing: null,
    agent_unavailable: 'agent_unavailable',
  };
