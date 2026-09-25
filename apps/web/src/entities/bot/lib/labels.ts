import type {
  ChatLabel,
  ChatMode,
  Gender,
  HandoffReason,
  LibraryKind,
  ObjectionCategory,
  Stage,
} from '@/shared/api';

/*
 * Подписи агента для интерфейса. Сервер присылает коды (`prices_silent`,
 * `diagnostic`), а человеку показываем слова — все они собраны здесь.
 * Для полей, которые в контракте строки (статус хода, вид задания), —
 * `Record<string, …>`: незнакомый код показывается как есть.
 */

export const STAGE_LABELS: Record<Stage, string> = {
  intake: 'Знакомство',
  links: 'Ссылки отправлены',
  diagnostic: 'Диагностика отправлена',
  offer: 'Предложение отправлено',
  prices: 'Цены отправлены',
};

export const MODE_LABELS: Record<ChatMode, string> = {
  auto: 'Ведёт агент',
  manager: 'У менеджера',
  off: 'Агент выключен',
};

/** Цвет режима: агент ведёт — зелёный, чат у человека — оранжевый. */
export function modeColor(mode: ChatMode): 'success' | 'warning' | 'default' {
  if (mode === 'auto') return 'success';
  if (mode === 'manager') return 'warning';
  return 'default';
}

export const CHAT_LABEL_LABELS: Record<ChatLabel, string> = {
  needs_reply: 'Нужен ответ',
  prices_silent: 'Цены отправлены, молчит',
  agent_unavailable: 'Агент недоступен',
};

export const HANDOFF_REASON_LABELS: Record<HandoffReason, string> = {
  media: 'Клиент прислал медиа',
  risk: 'Риск: агрессия, кризис, просьба позвать человека или вопрос «вы бот?»',
  no_language_materials: 'Нет материалов на языке клиента',
  reply_after_prices: 'Клиент ответил после цен',
  prices_sent: 'Цены отправлены',
  foreign_outgoing: 'В чат написал человек',
  agent_unavailable: 'Агент недоступен',
};

export const LIBRARY_KIND_LABELS: Record<LibraryKind, string> = {
  greeting: 'Приветствие',
  ask_birth_data: 'Просьба о дате и месте',
  no_birth_data: 'Нет данных рождения',
  ask_request: 'Вопрос о запросе',
  empathy: 'Эмпатия',
  wait: 'Ожидание диагностики',
  links: 'Ссылки',
  diagnostic: 'Диагностики',
  return_question: 'Вопрос после диагностики',
  offer: 'Описание услуг',
  prices: 'Цены',
  nudge: 'Подталкивания',
  price_deflect: 'Цена раньше времени',
  objection: 'Возражения',
  about: 'О себе и о работе',
};

export const OBJECTION_LABELS: Record<ObjectionCategory, string> = {
  expensive: 'Дорого',
  think_about_it: 'Подумаю',
  dont_believe: 'Не верю',
  no_time: 'Нет времени',
  ask_partner: 'Посоветуюсь с партнёром',
  tried_before: 'Уже пробовал',
  later: 'Потом',
};

/** Для кого текст библиотеки: пол клиента. */
export const CLIENT_GENDER_LABELS: Record<Gender, string> = {
  f: 'женщинам',
  m: 'мужчинам',
};

/** Задания планировщика. */
export const JOB_KIND_LABELS: Record<string, string> = {
  diagnostic: 'Отправить диагностику',
  birth_data_reminder: 'Напомнить о дате рождения',
  return_question: 'Вопрос после диагностики',
  offer: 'Отправить предложение',
  offer_nudge: 'Вопрос после предложения',
  prices: 'Отправить цены',
  unread_reminder: 'Напомнить о себе',
  reply: 'Повторить ответ клиенту',
};

export const JOB_STATUS_LABELS: Record<string, string> = {
  pending: 'ждёт',
  running: 'выполняется',
  done: 'выполнено',
  cancelled: 'отменено',
  failed: 'ошибка',
};

export const TRIGGER_LABELS: Record<string, string> = {
  client: 'Ответ клиенту',
  schedule: 'По расписанию',
  restore: 'Восстановление памяти',
};

export type TurnStatusColor =
  'success' | 'warning' | 'error' | 'default' | 'info';

export const TURN_STATUS_LABELS: Record<
  string,
  { label: string; color: TurnStatusColor }
> = {
  running: { label: 'идёт', color: 'info' },
  sent: { label: 'отправлено', color: 'success' },
  done: { label: 'готово', color: 'success' },
  handoff: { label: 'менеджеру', color: 'warning' },
  skipped: { label: 'пропущен', color: 'default' },
  failed: { label: 'ошибка', color: 'error' },
};

export const TOPIC_LABELS: Record<string, string> = {
  price: 'цена',
  practice: 'практики',
  diagnostic: 'диагностика',
  practitioner: 'о практике',
  client: 'о себе',
  other: 'другое',
};

export const CARD_LABELS: Record<string, string> = {
  name: 'Имя',
  gender: 'Пол',
  birthDate: 'Дата рождения',
  birthPlace: 'Место рождения',
  category: 'Запрос',
  language: 'Язык',
};

/** Подпись вида задания; незнакомый код — как есть. */
export function jobKindLabel(kind: string): string {
  return JOB_KIND_LABELS[kind] ?? kind;
}
