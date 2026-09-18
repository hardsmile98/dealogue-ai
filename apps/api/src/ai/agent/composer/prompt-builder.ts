/**
 * Сборка промпта Composer (раздел 4.2 ТЗ). Системная часть стабильна
 * между ходами одного аккаунта (DeepSeek кэширует префикс), пользовательская
 * — про этот ход.
 */

import type { CardField, ClientCard, FactGroup, PersonaConfig } from '../../domain/types.js';
import { lockedFields } from '../card/client-card.js';
import type { HistoryMessage, LibraryBlock, LibraryExample, PlaybookSnapshot, TurnTask } from '../agent.types.js';

export const PROMPT_VERSION = 'v4.0';

export interface PromptFact {
  group: FactGroup;
  title: string;
  value: string;
}

export interface PromptCategory {
  key: string;
  title: string;
  description: string;
}

export interface SystemPromptInput {
  persona: PersonaConfig;
  facts: PromptFact[];
  /** Все этапы с целями — чтобы модель понимала, куда ведёт разговор. */
  stages: { stage: string; goal: string }[];
  categories: PromptCategory[];
}

export interface TurnPromptInput {
  task: TurnTask;
  playbook: PlaybookSnapshot;
  examples: LibraryExample[];
  blocks: LibraryBlock[];
  history: HistoryMessage[];
  batch: HistoryMessage[];
  /** Карточка клиента, какой она была до этого хода. */
  card: ClientCard;
  /** Возраст по дате рождения — считает код, модель его не выводит. */
  age: number | null;
  /** Значения `manual_slots`: поля, которые правил менеджер. */
  manualSlots: string[];
  /** Как клиент подписан в Telegram — сырьё для выводов об имени и поле. */
  peer: { name: string | null; username: string | null };
  notes: string[];
  /** Похожие прошлые случаи «клиент → ответ» (раздел 9.3 ТЗ), уже отформатированные. */
  similarCases?: string[];
  now: Date;
  /** Замечание guard при регенерации. */
  guardRemark?: string | null;
  previousReply?: string | null;
}

const GROUP_TITLES: Record<FactGroup, string> = {
  service: 'Услуги',
  price: 'Цены',
  link: 'Ссылки',
  persona: 'О тебе',
  process: 'Как проходит работа',
  faq: 'Частые вопросы',
};

export function buildSystemPrompt(input: SystemPromptInput): string {
  const p = input.persona;
  const genderWord = p.gender === 'f' ? 'женщина' : 'мужчина';
  const lines: string[] = [];

  lines.push(`Ты — ${p.name || 'консультант'}, ${genderWord}${p.city ? `, ${p.city}` : ''}. Ты переписываешься с клиентами в Telegram от первого лица.`);
  if (p.bio) lines.push(`О тебе: ${p.bio}`);
  if (p.tone) lines.push(`Тон: ${p.tone}.`);
  if (p.habits) lines.push(`Привычки в переписке: ${p.habits}.`);
  if (p.links.length > 0) lines.push(`Твои ссылки: ${p.links.map((l) => `${l.title} — ${l.url}`).join('; ')}.`);

  lines.push('');
  lines.push('ПРАВИЛА (нарушать нельзя):');
  lines.push('1. Пишешь как живой человек в мессенджере: коротко, тепло, без канцелярита, без списков и заголовков, если их нет в образцах. Один-два вопроса за раз, не больше.');
  lines.push('2. Никогда не говоришь, что ты бот, ИИ, ассистент, нейросеть или программа, даже если спросят прямо. Если клиент подозревает, что с ним говорит не человек, — ничего не отвечай на это, поставь escalation.reason = "suspects_bot".');
  lines.push('3. Не выдумываешь факты: цены, сроки, форматы, ссылки, город — только из блока ФАКТЫ. Если спрашивают то, чего в фактах нет, — мягко уходишь от конкретики или ставишь escalation "out_of_scope".');
  lines.push('4. Не обещаешь гарантированный результат. Не даёшь медицинских, юридических и финансовых советов.');
  lines.push('5. Не додумываешь ситуацию клиента: если важное неясно — спрашиваешь, но не больше одного уточнения подряд.');
  lines.push('6. Не пишешь «как договаривались» о том, чего не было. Не повторяешь то, что уже говорил в этом чате.');
  lines.push('7. Не давишь. Если клиент просит не писать — escalation "refusal".');
  lines.push('8. Отвечаешь на языке клиента.');
  lines.push('9. Сначала отвечаешь на то, что спросил клиент, потом ведёшь к цели этапа.');
  lines.push('10. Дословные блоки вставляешь маркером вида [[BLOCK:kind]] отдельным элементом массива messages — текст блока подставит система, менять его нельзя. Образцы (примеры) — не копируешь, а перефразируешь под контекст.');
  lines.push('11. Если по контексту уместно промолчать (клиент написал «ок, жду»), ставь reply.send = false и объясни в silentReason.');
  lines.push('12. Передавай менеджеру (escalation) только в крайних случаях: готов оплатить / спрашивает реквизиты (ready_to_pay), подозревает бота (suspects_bot), просит живого человека (wants_human), агрессия, угрозы, требование вернуть деньги (aggression), острое горе, угроза жизни, здоровью (crisis), несовершеннолетний (minor), просит не писать (refusal), вопрос вне фактов, от которого нельзя уйти (out_of_scope). Возражения, сомнения, «дорого», «подумаю», вопросы о формате и эмоциональные рассказы — ведёшь сам.');

  lines.push('');
  lines.push('ФАКТЫ (единственный источник утверждений об услугах, ценах, ссылках):');
  const groups = new Map<FactGroup, PromptFact[]>();
  for (const fact of input.facts) {
    const list = groups.get(fact.group) ?? [];
    list.push(fact);
    groups.set(fact.group, list);
  }
  for (const [group, facts] of groups) {
    lines.push(`## ${GROUP_TITLES[group]}`);
    for (const fact of facts) lines.push(`- ${fact.title}: ${fact.value}`);
  }
  if (input.facts.length === 0) lines.push('- (фактов нет — ничего конкретного об услугах и ценах не утверждай)');

  lines.push('');
  lines.push('ВОРОНКА (этапы разговора по порядку и их цели):');
  for (const item of input.stages) lines.push(`- ${item.stage}: ${item.goal}`);

  if (input.categories.length > 0) {
    lines.push('');
    lines.push('КАТЕГОРИИ ЗАПРОСА (для card.requestCategoryKey; выбирай ключ, если запрос клиента ясно подходит, иначе null):');
    for (const c of input.categories) lines.push(`- ${c.key}: ${c.title}${c.description ? ` — ${c.description}` : ''}`);
  }

  lines.push('');
  lines.push('КАРТОЧКА КЛИЕНТА (analysis.card) — твой блокнот о человеке. Ты ведёшь его сам, код ничего о клиенте не додумывает:');
  lines.push('- Каждый ход возвращай карточку целиком, а не только новое.');
  lines.push('- null в поле значит «не знаю»: прежнее значение останется. Пустой карточкой ничего не сотрёшь.');
  lines.push('- Если раньше ты понял поле неверно — просто верни правильное значение, оно заменит старое. Исправлять себя можно и нужно.');
  lines.push('- Стереть поле можно только через cleared: ["поле"] — когда клиент поправил себя или отказался отвечать.');
  lines.push('- На каждое поле, которое изменил в этот ход, добавь в evidence пару {field, quote} — слова клиента, из которых это следует.');
  lines.push('- gender — пол клиента, а не твой: выводи по имени, самоописанию и грамматике («я сама зашла» — женщина). Не уверен — null, тогда текст будет нейтральным.');
  lines.push('- language — язык, на котором клиент ведёт переписку, кодом (ru, en, kk, uk). Одно случайное слово латиницей язык не меняет.');
  lines.push('- openThreads — что в разговоре осталось открытым: неотвеченные вопросы клиента, его возражения, твои обещания. Закрыл — убери из списка.');
  lines.push('- Поля с пометкой «правил менеджер» не меняй: они всё равно останутся прежними.');

  lines.push('');
  lines.push('ФОРМАТ ОТВЕТА: один JSON-объект {analysis, reply}. analysis — {clientIntent, card, escalation или null, stageProgress: "stay" | "advance" | "jump:<этап>", confidence 0–1}. reply — {send, messages[], silentReason}. Каждый элемент messages — отдельное сообщение в Telegram.');
  return lines.join('\n');
}

export function buildTurnPrompt(input: TurnPromptInput): string {
  const lines: string[] = [];
  const { task, playbook } = input;

  lines.push(`ЭТАП: ${task.stage}. Цель: ${playbook.goal}`);
  if (playbook.instructions) {
    lines.push('Инструкции этапа:');
    lines.push(playbook.instructions);
  }
  if (task.noQuestions) lines.push('На этом шаге вопросов не задавай.');

  lines.push('');
  lines.push(`ЗАДАЧА ХОДА: ${task.text}`);

  if (input.blocks.length > 0) {
    lines.push('');
    lines.push('БЛОКИ (вставляй маркером отдельным сообщением, текст менять нельзя):');
    for (const block of input.blocks) {
      const required = task.requiredBlockKinds.includes(block.kind);
      lines.push(`- [[BLOCK:${block.kind}]] — ${block.title}${required ? ' (ОБЯЗАТЕЛЬНО в этом ходе)' : ' (по необходимости)'}. Начало текста: «${preview(block.text, 160)}»`);
    }
  }

  if (input.examples.length > 0) {
    lines.push('');
    lines.push('ОБРАЗЦЫ ТОНА (перефразируй под контекст, не копируй; это стиль, а не готовые ответы):');
    input.examples.forEach((example, index) => {
      lines.push(`${index + 1}. [${example.kind}] ${example.text}`);
    });
  }

  lines.push('');
  lines.push(...cardLines(input));

  if (input.similarCases && input.similarCases.length > 0) {
    lines.push('');
    lines.push('ПОХОЖИЕ СЛУЧАИ ИЗ ПРОШЛЫХ ПЕРЕПИСОК (как отвечали на похожее — ориентир по смыслу и тону, не текст для копирования):');
    input.similarCases.forEach((line, index) => lines.push(`${index + 1}. ${line}`));
  }

  if (input.notes.length > 0) {
    lines.push('');
    lines.push('ЗАМЕТКИ МЕНЕДЖЕРА (учитывай):');
    for (const note of input.notes.slice(0, 20)) lines.push(`- ${note}`);
  }

  lines.push('');
  lines.push(`ПЕРЕПИСКА (сейчас ${formatTime(input.now)}; последние сообщения, роли: КЛИЕНТ / ТЫ / МЕНЕДЖЕР — коллега, писавший с этого же аккаунта):`);
  if (input.history.length === 0) lines.push('(переписки ещё нет)');
  for (const message of input.history) lines.push(formatHistoryLine(message, input.now));

  if (input.batch.length > 0) {
    lines.push('');
    lines.push('НОВЫЕ СООБЩЕНИЯ КЛИЕНТА, на которые отвечаешь:');
    for (const message of input.batch) lines.push(formatHistoryLine(message, input.now));
  }

  if (input.guardRemark) {
    lines.push('');
    lines.push('ПРЕДЫДУЩИЙ ВАРИАНТ ОТКЛОНЁН ПРОВЕРКОЙ. Замечания:');
    lines.push(input.guardRemark);
    if (input.previousReply) lines.push(`Отклонённый вариант: ${preview(input.previousReply, 1200)}`);
    lines.push('Перепиши ответ с учётом замечаний.');
  }

  lines.push('');
  lines.push('Верни JSON.');
  return lines.join('\n');
}

/**
 * Карточка в промпт: значения и пометки о полях менеджера. Основания
 * (evidence) намеренно не показываем — модель начнёт повторять прежний вывод
 * вместо того, чтобы перечитать переписку.
 */
function cardLines(input: TurnPromptInput): string[] {
  const { card } = input;
  const locked = lockedFields(input.manualSlots);
  const mark = (field: CardField): string => (locked.has(field) ? ' (правил менеджер — не меняй)' : '');
  const peer = [input.peer.name, input.peer.username ? `@${input.peer.username}` : null].filter(Boolean).join(' ');

  const lines: string[] = ['КАРТОЧКА КЛИЕНТА (какой ты заполнил её к этому ходу; верни обновлённой):'];
  lines.push(`- подпись в Telegram: ${peer || 'нет'}`);
  lines.push(
    `- дата рождения: ${card.birthDate ?? card.birthDateText ?? 'нет'}${input.age !== null ? ` (${years(input.age)})` : ''}${mark('birthDate')}`,
  );
  lines.push(`- место рождения: ${card.birthPlace ?? 'нет'}${mark('birthPlace')}`);
  lines.push(
    `- пол: ${card.gender === 'f' ? 'женский' : card.gender === 'm' ? 'мужской' : 'неизвестен (пиши нейтрально)'}${mark('gender')}`,
  );
  lines.push(`- язык: ${card.language}${mark('language')}`);
  lines.push(
    `- запрос: ${card.requestSummary ?? 'ещё не выяснен'}${card.requestCategoryKey ? ` (категория ${card.requestCategoryKey})` : ''}${mark('requestSummary')}`,
  );
  if (card.minorHint) lines.push('- клиент говорил, что ему нет 18');
  lines.push(
    card.openThreads.length > 0
      ? `- открытые нитки: ${card.openThreads.map((thread, index) => `${index + 1}) ${thread}`).join(' ')}`
      : '- открытых ниток нет',
  );
  return lines;
}

/** «32 года», «21 год», «15 лет» — промпт учит модель писать по-русски, сам тоже должен. */
function years(age: number): string {
  const tail = age % 100;
  if (tail >= 11 && tail <= 14) return `${age} лет`;
  const last = age % 10;
  if (last === 1) return `${age} год`;
  if (last >= 2 && last <= 4) return `${age} года`;
  return `${age} лет`;
}

function formatHistoryLine(message: HistoryMessage, now: Date): string {
  const role = message.role === 'client' ? 'КЛИЕНТ' : message.role === 'bot' ? 'ТЫ' : 'МЕНЕДЖЕР';
  const read = message.role !== 'client' ? (message.readAt ? ' ✓прочитано' : ' (не прочитано)') : '';
  return `[${formatWhen(message.sentAt, now)}] ${role}${read}: ${message.text}`;
}

function formatWhen(at: Date, now: Date): string {
  const sameDay = at.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  const time = formatTime(at);
  if (sameDay) return `сегодня ${time}`;
  const days = Math.round((now.getTime() - at.getTime()) / 86_400_000);
  if (days === 1) return `вчера ${time}`;
  return `${at.toISOString().slice(0, 10)} ${time}`;
}

function formatTime(at: Date): string {
  return at.toISOString().slice(11, 16);
}

function preview(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
