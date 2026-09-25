import type { HistoryLine } from '../core/history.js';
import type { IncomingMessage, Memory } from '../core/types.js';
import { REQUEST_CATEGORIES } from '../library/kinds.js';
import type { Persona } from '../library/persona.js';

/** Общие куски промптов. Всё по-русски: модель отвечает на языке клиента по указанию, а инструкции — на русском. */

export interface LibrarySample {
  kind: string;
  title: string;
  text: string;
}

export interface ExampleSample {
  situation: string;
  client: string;
  practitioner: string;
}

export function personaBlock(persona: Persona): string {
  const lines = [
    `Имя: ${persona.name}. Пол: ${persona.gender === 'f' ? 'женский — о себе пишешь в женском роде («я поняла», «рада»)' : 'мужской — о себе пишешь в мужском роде («я понял», «рад»)'}.`,
    persona.bio
      ? `О себе: ${persona.bio}`
      : 'О себе: биография не заполнена — о своей жизни говори общо, без выдуманных фактов.',
  ];
  if (persona.links.length > 0) {
    lines.push(
      `Страницы: ${persona.links.map((link) => `${link.title} ${link.url}`).join('; ')}.`,
    );
  }
  return lines.join('\n');
}

export function memoryBlock(memory: Memory): string {
  const card: string[] = [];
  const field = (
    label: string,
    value: string | undefined,
    confidence: number | undefined,
  ) =>
    value
      ? card.push(
          `${label}: ${value}${confidence !== undefined && confidence < 0.8 ? ' (не точно)' : ''}`,
        )
      : undefined;
  field('Имя', memory.card.name?.value, memory.card.name?.confidence);
  field(
    'Пол',
    memory.card.gender?.value === 'f'
      ? 'женщина'
      : memory.card.gender?.value === 'm'
        ? 'мужчина'
        : undefined,
    memory.card.gender?.confidence,
  );
  field(
    'Дата рождения',
    memory.card.birthDate?.value,
    memory.card.birthDate?.confidence,
  );
  field(
    'Место рождения',
    memory.card.birthPlace?.value,
    memory.card.birthPlace?.confidence,
  );
  const category = REQUEST_CATEGORIES.find(
    (item) => item.key === memory.card.category?.value,
  );
  field('Запрос', category?.title, memory.card.category?.confidence);
  field('Язык', memory.card.language?.value, memory.card.language?.confidence);

  const lines = [
    `Карточка: ${card.length > 0 ? card.join('; ') : 'пока ничего не известно'}.`,
  ];
  if (memory.facts.length > 0) {
    lines.push('Факты о клиенте (свежие первыми):');
    for (const fact of memory.facts)
      lines.push(`- ${fact.text}${fact.confidence < 0.8 ? ' (не точно)' : ''}`);
  }
  lines.push(
    `Резюме разговора: ${memory.summary || 'разговор только начался'}.`,
  );
  return lines.join('\n');
}

export function historyBlock(lines: readonly HistoryLine[]): string {
  if (lines.length === 0) return 'Переписки ещё не было.';
  return lines
    .map((line) => `${line.role === 'client' ? 'Клиент' : 'Ты'}: ${line.text}`)
    .join('\n');
}

export function turnBlock(messages: readonly IncomingMessage[]): string {
  if (messages.length === 0) return '(сообщений нет — ход по расписанию)';
  return messages
    .map((message) =>
      message.mediaKind
        ? `[${message.mediaKind}] ${message.text}`.trim()
        : message.text,
    )
    .join('\n');
}

/** Сколько символов тела вехи видят ответчик и проверяющий — чтобы не повторять его смысл. */
export const BLOCK_PREVIEW_LENGTH = 400;

/** Начало тела вехи для промпта: смысл понятен, целиком текст не нужен. */
export function blockPreview(block: string): string {
  const text = block.replace(/\s+/g, ' ').trim();
  return text.length > BLOCK_PREVIEW_LENGTH
    ? `${text.slice(0, BLOCK_PREVIEW_LENGTH)}…`
    : text;
}

export function libraryBlock(samples: readonly LibrarySample[]): string {
  if (samples.length === 0) return '';
  return samples
    .map((sample) => `— ${sample.title}:\n${sample.text}`)
    .join('\n\n');
}

export function aboutBlock(samples: readonly LibrarySample[]): string {
  if (samples.length === 0)
    return 'Раздел «о себе и о работе» пуст: на вопросы о практике отвечай общо, без конкретных цифр, сроков и фактов.';
  return samples
    .map((sample) => `Вопрос: ${sample.title}\nОтвет: ${sample.text}`)
    .join('\n\n');
}

export function examplesBlock(examples: readonly ExampleSample[]): string {
  if (examples.length === 0) return '';
  return examples
    .map(
      (example) =>
        `Ситуация: ${example.situation}\nКлиент: ${example.client}\nТы: ${example.practitioner}`,
    )
    .join('\n\n');
}

export function categoriesBlock(): string {
  return REQUEST_CATEGORIES.map(
    (category) => `${category.key} — ${category.title}`,
  ).join('\n');
}
