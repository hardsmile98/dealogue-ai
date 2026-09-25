/**
 * Справочники агента — зеркало apps/api/src/bot/library/kinds.ts.
 * Менять синхронно. Подписи для интерфейса здесь не живут: они в
 * `entities/bot/lib/labels.ts`.
 */

/** Вехи воронки по порядку: код отправляет их из библиотеки, LLM только обрамляет. */
export const MILESTONES = ['links', 'diagnostic', 'offer', 'prices'] as const;
export type Milestone = (typeof MILESTONES)[number];

/** Этап = последняя доставленная веха; `intake` — ничего ещё не доставлено. */
export const STAGES = ['intake', ...MILESTONES] as const;
export type Stage = (typeof STAGES)[number];

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
  title: string;
}

/** Категории запроса клиента — по ним выбирается диагностика. */
export const REQUEST_CATEGORIES: readonly RequestCategory[] = [
  { key: 'relationships.breakup', title: 'Расставание' },
  { key: 'relationships.psych_astro', title: 'Психология и астрология' },
  {
    key: 'relationships.single',
    title: 'Нет отношений, не получается построить',
  },
  { key: 'relationships.ex_conflict', title: 'Бывший партнёр или конфликт' },
  { key: 'relationships.triangle', title: 'Любовный треугольник, измены' },
  { key: 'relationships.couple', title: 'Отношения в паре' },
  { key: 'money.love', title: 'Финансы и любовь' },
  { key: 'money.work', title: 'Финансы и работа' },
  { key: 'money.sudden_loss', title: 'Резкая потеря денег' },
  { key: 'money.instability', title: 'Финансовая нестабильность' },
  { key: 'money.more', title: 'Хочет больше денег' },
  { key: 'money.second_business', title: 'Второй бизнес' },
  { key: 'money.relationships', title: 'Финансы и отношения в паре' },
  { key: 'money.health', title: 'Финансы и здоровье' },
  { key: 'health.own', title: 'Здоровье' },
  { key: 'health.child', title: 'Здоровье ребёнка' },
  { key: 'family.child', title: 'Семья, ребёнок' },
  { key: 'family.childbearing', title: 'Деторождение' },
  { key: 'universal.general', title: 'Универсальная' },
  { key: 'universal.seven_roads', title: '7 дорог' },
  { key: 'universal.chakras', title: 'Заблокированы чакры' },
  { key: 'future.general', title: 'На будущее' },
  { key: 'future.3m', title: 'На будущее, 3 месяца' },
  { key: 'request.card_reading', title: 'Карта и разбор по запросу' },
  { key: 'other.phobia_insects', title: 'Боязнь насекомых' },
  { key: 'other.relocation', title: 'Переезд' },
];

/** Режим чата: агент ведёт сам, чат у менеджера, агент выключен в этом чате. */
export type ChatMode = 'auto' | 'manager' | 'off';
/** Что владелец может выставить руками; `manager` ставит только система. */
export type ManualChatMode = 'auto' | 'off';

/** Ярлык чата в списке «у менеджера». */
export type ChatLabel = 'needs_reply' | 'prices_silent' | 'agent_unavailable';

/** Причины передачи менеджеру. */
export type HandoffReason =
  | 'media'
  | 'risk'
  | 'no_language_materials'
  | 'reply_after_prices'
  | 'prices_sent'
  | 'foreign_outgoing'
  | 'agent_unavailable';
