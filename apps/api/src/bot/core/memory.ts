import { SPHERE_CATEGORY, isSphere } from '../library/kinds.js';
import type { Gender } from '../library/kinds.js';
import type {
  Analysis,
  CardField,
  ClientCard,
  ClientFact,
  Memory,
  SaidEntry,
} from './types.js';

/** Ниже этих порогов пол, категория и сфера считаются неизвестными (раздел 4). */
export const GENDER_CONFIDENCE = 0.8;
export const CATEGORY_CONFIDENCE = 0.7;
export const SPHERE_CONFIDENCE = 0.6;
/** Сколько активных фактов идёт в промпт. */
export const FACTS_LIMIT = 30;
/**
 * Сменить уже известный язык может только ход, где клиент написал хотя бы
 * столько букв: «ok», «👍» или имя на латинице диалог не переключают.
 */
export const LANGUAGE_SWITCH_MIN_LETTERS = 20;

/** Карточка из jsonb: поля без value отбрасываются. */
export function readCard(raw: unknown): ClientCard {
  if (typeof raw !== 'object' || raw === null) return {};
  const source = raw as Record<string, unknown>;
  const card: ClientCard = {};
  for (const key of [
    'name',
    'gender',
    'birthDate',
    'birthYear',
    'birthDateDeclined',
    'birthPlace',
    'sphere',
    'category',
    'language',
  ] as const) {
    const field = source[key];
    if (typeof field !== 'object' || field === null) continue;
    const { value, confidence, sourceMessageId } = field as Partial<
      CardField<unknown>
    >;
    if (value === undefined || value === null || value === '') continue;
    const normalized: CardField<string> = {
      value: String(value),
      confidence: typeof confidence === 'number' ? confidence : 1,
    };
    if (typeof sourceMessageId === 'number')
      normalized.sourceMessageId = sourceMessageId;
    (card as Record<string, CardField<string>>)[key] = normalized;
  }
  return card;
}

/**
 * Новое значение поля берётся, если оно увереннее старого или старого нет.
 * Так одно неуверенное «кажется, женщина» не затрёт уверенный ответ клиента.
 */
export function mergeCard(current: ClientCard, update: ClientCard): ClientCard {
  const merged: ClientCard = { ...current };
  for (const key of Object.keys(update) as (keyof ClientCard)[]) {
    const next = update[key] as CardField<string> | undefined;
    if (!next) continue;
    const previous = merged[key] as CardField<string> | undefined;
    if (!previous || next.confidence >= previous.confidence) {
      (merged as Record<string, CardField<string>>)[key] = next;
    }
  }
  return merged;
}

/** Пол для выбора диагностики: только при достаточной уверенности. */
export function knownGender(card: ClientCard): Gender | null {
  const field = card.gender;
  return field && field.confidence >= GENDER_CONFIDENCE ? field.value : null;
}

export function knownCategory(card: ClientCard): string | null {
  const field = card.category;
  return field && field.confidence >= CATEGORY_CONFIDENCE ? field.value : null;
}

/** Сфера, в которой анализатор достаточно уверен; догадка ниже порога — «сфера не названа». */
export function knownSphere(card: ClientCard): string | null {
  const field = card.sphere;
  return field && field.confidence >= SPHERE_CONFIDENCE && isSphere(field.value)
    ? field.value
    : null;
}

/** Клиент назвал, с чем пришёл: сферу («финансы», «всё сразу») или ясную подкатегорию. */
export function requestKnown(card: ClientCard): boolean {
  return knownCategory(card) !== null || knownSphere(card) !== null;
}

/**
 * Категория для выбора диагностики: ясная подкатегория, а если её нет —
 * основная категория названной сферы («финансы» → финансовая диагностика).
 * null — запрос неизвестен, будет универсальная.
 */
export function diagnosticCategory(card: ClientCard): string | null {
  const sphere = knownSphere(card);
  return (
    knownCategory(card) ??
    (sphere && isSphere(sphere) ? SPHERE_CATEGORY[sphere] : null)
  );
}

/**
 * Год рождения: из поля анализатора или из самой даты (четыре цифры или
 * «дд.мм.гг»). Это разбор поля карточки, которое уже заполнил анализатор, а
 * не текста клиента: только цифры. null — года нет («12.03»).
 */
export function birthYearOf(
  card: ClientCard,
  now: Date = new Date(),
): number | null {
  const thisYear = now.getUTCFullYear();
  const fromField = Number(card.birthYear?.value);
  if (Number.isInteger(fromField) && fromField > 1900 && fromField <= thisYear)
    return fromField;
  const date = card.birthDate?.value ?? '';
  const full = /(?:^|\D)(19\d\d|20\d\d)(?!\d)/.exec(date);
  if (full) {
    const year = Number(full[1]);
    return year <= thisYear ? year : null;
  }
  const short = /^\s*\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*(\d{2})\s*$/.exec(
    date,
  );
  if (!short) return null;
  const yy = Number(short[1]);
  return yy <= thisYear % 100 ? 2000 + yy : 1900 + yy;
}

/** Возраст ниже этого — скорее опечатка в дате, чем ребёнок: по нему не отказываем. */
const IMPLAUSIBLE_AGE = 10;

/**
 * Клиент младше `minAge` по дате рождения: при полной дате — точно, при
 * одном годе — только если младше при любом дне рождения. Неизвестно или
 * похоже на опечатку — false.
 */
export function isUnderage(
  card: ClientCard,
  now: Date,
  minAge: number,
): boolean {
  const year = birthYearOf(card, now);
  if (year === null) return false;
  let age = now.getUTCFullYear() - year;
  const dayMonth = /^\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/.exec(
    card.birthDate?.value ?? '',
  );
  const day = Number(dayMonth?.[1]);
  const month = Number(dayMonth?.[2]);
  if (dayMonth && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
    const beforeBirthday =
      now.getUTCMonth() + 1 < month ||
      (now.getUTCMonth() + 1 === month && now.getUTCDate() < day);
    if (beforeBirthday) age -= 1;
  }
  return age >= IMPLAUSIBLE_AGE && age < minAge;
}

/**
 * Дату рождения больше не просим: она известна с годом или клиент сказал,
 * что её не будет. День и месяц без года — не дата: агент просит год, как
 * человек в реальной переписке. Место рождения необязательно (решение
 * владельца 30.09): его просят только в первом сообщении вместе с датой.
 */
export function birthDateSettled(card: ClientCard): boolean {
  if (card.birthDateDeclined?.value) return true;
  return Boolean(card.birthDate?.value) && birthYearOf(card) !== null;
}

export function clientLanguage(card: ClientCard, fallback = 'ru'): string {
  return card.language?.value ?? fallback;
}

export interface FactsUpdate {
  /** Что добавить. */
  added: ClientFact[];
  /** Тексты активных фактов, которые нужно пометить superseded. */
  superseded: string[];
}

/**
 * Новые факты из анализа: дубликаты (тот же текст без учёта регистра)
 * не добавляются, противоречия помечают старые факты. Результат — что
 * записать в базу и новый список активных фактов для промпта.
 */
export function applyFacts(
  active: readonly ClientFact[],
  analysis: Analysis,
): { facts: ClientFact[]; update: FactsUpdate } {
  const normalize = (text: string) => text.trim().toLowerCase();
  const superseded = new Set(analysis.supersedes.map(normalize));
  const kept = active.filter((fact) => !superseded.has(normalize(fact.text)));
  const known = new Set(kept.map((fact) => normalize(fact.text)));
  const added: ClientFact[] = [];
  for (const fact of analysis.facts) {
    const key = normalize(fact.text);
    if (known.has(key)) continue;
    known.add(key);
    added.push(fact);
  }
  const facts = [...added, ...kept].slice(0, FACTS_LIMIT);
  return {
    facts,
    update: {
      added,
      superseded: active
        .filter((fact) => superseded.has(normalize(fact.text)))
        .map((fact) => fact.text),
    },
  };
}

/** Сколько букв в тексте (любой письменности); цифры, эмодзи и знаки не считаются. */
export function letterCount(text: string): number {
  let count = 0;
  for (const char of text)
    if (char.toLowerCase() !== char.toUpperCase()) count += 1;
  return count;
}

/**
 * Язык карточки «липкий»: первый определённый язык записывается сразу,
 * смена — только по ходу с настоящим текстом. Так план и ответчик не
 * прыгают между языками от реплики к реплике.
 */
export function nextLanguage(
  card: ClientCard,
  detected: string | null,
  newText: string,
): ClientCard['language'] {
  const current = card.language;
  if (!detected || detected === current?.value) return current;
  if (!current || letterCount(newText) >= LANGUAGE_SWITCH_MIN_LETTERS)
    return { value: detected, confidence: 1 };
  return current;
}

/**
 * Имя в карточке — только то, что клиент назвал сам. Имя из профиля
 * анализатор видит ради пола; если он всё же записал его в карточку, а в
 * тексте клиента этого имени нет, поле отбрасывается — иначе ответчик
 * начнёт обращаться к клиенту по профилю или нику.
 */
export function withoutProfileName(
  update: ClientCard,
  profileName: string | null,
  newText: string,
): ClientCard {
  const name = update.name?.value.trim().toLowerCase();
  if (!name || !profileName) return update;
  const fromProfile = profileName.toLowerCase().includes(name);
  if (!fromProfile || newText.toLowerCase().includes(name)) return update;
  const rest = { ...update };
  delete rest.name;
  return rest;
}

/** Память после анализа — то, что видят план и ответчик в этом ходе. */
export function applyAnalysis(
  memory: Memory,
  analysis: Analysis,
  newText = '',
  profileName: string | null = null,
): { memory: Memory; factsUpdate: FactsUpdate } {
  const { facts, update } = applyFacts(memory.facts, analysis);
  const card = mergeCard(
    memory.card,
    withoutProfileName(analysis.card, profileName, newText),
  );
  const language = nextLanguage(memory.card, analysis.language, newText);
  if (language) card.language = language;
  return {
    memory: {
      card,
      facts,
      summary: analysis.summary || memory.summary,
      said: memory.said,
    },
    factsUpdate: update,
  };
}

export function nudgesSaid(said: readonly SaidEntry[], nudge: string): number {
  return said.filter((entry) => entry.kind === 'nudge' && entry.key === nudge)
    .length;
}

/**
 * Что агент сказал после вехи — то есть на её этапе: записи с сообщениями
 * позже сообщения вехи. Записи одного хода делят время, поэтому порядок
 * решает id сообщения, а не место в реестре; у записей без id — место.
 * Вехи в реестре нет — пусто.
 */
export function saidSince(
  said: readonly SaidEntry[],
  milestone: string,
): SaidEntry[] {
  let index = -1;
  for (let i = said.length - 1; i >= 0 && index < 0; i--) {
    const entry = said[i] as SaidEntry;
    if (entry.kind === 'milestone' && entry.key === milestone) index = i;
  }
  if (index < 0) return [];
  const mark = (said[index] as SaidEntry).messageId;
  return said.filter((entry, i) => {
    if (i === index) return false;
    if (mark !== null && entry.messageId !== null)
      return entry.messageId > mark;
    return i > index;
  });
}

/**
 * Напоминания, которые возвращают к последнему вопросу, а не задают новый:
 * после них разговор там же, где был до них.
 */
const RETURNING_NUDGES: readonly string[] = ['follow_up', 'unread_reminder'];

/** Чем закончилась последняя отработка возражения на этапе, если после неё не было шага воронки. */
export type ObjectionPending = 'question' | 'pause' | 'release';

const OBJECTION_PENDING: Readonly<Record<string, ObjectionPending>> = {
  clarify_objection: 'question',
  pause_objection: 'pause',
  release_objection: 'release',
};

/**
 * Где разговор после возражения (docs/agent-architecture.md, 2.5): по
 * последней отметке этапа — агент задал уточнение (`question`), оставил
 * дверь открытой (`pause`) или отпустил клиента (`release`); после шага
 * воронки — null. Напоминание по разговору этого не меняет. Пока отработка
 * не закрыта шагом, ответ клиента — не согласие на следующую веху.
 */
export function objectionPending(
  said: readonly SaidEntry[],
  milestone: string,
): ObjectionPending | null {
  let last: SaidEntry | null = null;
  for (const entry of saidSince(said, milestone)) {
    if (entry.kind !== 'nudge' || RETURNING_NUDGES.includes(entry.key))
      continue;
    if (
      !last ||
      last.messageId === null ||
      entry.messageId === null ||
      entry.messageId >= last.messageId
    )
      last = entry;
  }
  return last ? (OBJECTION_PENDING[last.key] ?? null) : null;
}

/** Вопросы знакомства (docs/agent-architecture.md, 2.0) по старшинству. */
const INTAKE_QUESTIONS = [
  'ask_birth_data',
  'ask_birth_date',
  'ask_sphere',
  'clarify_request',
] as const;
export type IntakeQuestionNudge = (typeof INTAKE_QUESTIONS)[number];
/** Просьбы о данных: дата, место и сфера; повторно — дата и сфера. */
const DATA_REQUESTS: readonly string[] = [
  'ask_birth_data',
  'ask_birth_date',
  'ask_sphere',
];

/**
 * Сколько сообщений агента просили данные (дату рождения, сферу) — первое
 * сообщение и повторные просьбы. Шаги одного сообщения — одна просьба.
 */
export function dataRequestsSent(said: readonly SaidEntry[]): number {
  const messages = new Set<number | string>();
  said.forEach((entry, index) => {
    if (entry.kind === 'nudge' && DATA_REQUESTS.includes(entry.key))
      messages.add(entry.messageId ?? `entry:${index}`);
  });
  return messages.size;
}
const INTAKE_REMINDERS: readonly string[] = [
  'birth_data_reminder',
  'clarify_reminder',
];

export interface IntakeQuestion {
  nudge: IntakeQuestionNudge;
  /** После него уже было напоминание: дальше молчание ведёт к диагностике. */
  reminded: boolean;
}

/**
 * Последний вопрос знакомства и было ли после него напоминание: на
 * молчание после каждого вопроса — одно напоминание, потом диагностика.
 * Уточнение внутри просьбы о данных записано тем же сообщением — вопросом
 * считается просьба о данных. null — ни о чём не спрашивали.
 */
export function lastIntakeQuestion(
  said: readonly SaidEntry[],
): IntakeQuestion | null {
  let last: { nudge: IntakeQuestionNudge; messageId: number | null } | null =
    null;
  let reminded = false;
  for (const entry of said) {
    if (entry.kind !== 'nudge') continue;
    const sameMessage =
      last !== null &&
      entry.messageId !== null &&
      entry.messageId === last.messageId;
    const index = (INTAKE_QUESTIONS as readonly string[]).indexOf(entry.key);
    if (index >= 0) {
      if (sameMessage && index > INTAKE_QUESTIONS.indexOf(last!.nudge))
        continue;
      last = { nudge: INTAKE_QUESTIONS[index]!, messageId: entry.messageId };
      reminded = false;
    } else if (last && !sameMessage && INTAKE_REMINDERS.includes(entry.key)) {
      reminded = true;
    }
  }
  return last && { nudge: last.nudge, reminded };
}
