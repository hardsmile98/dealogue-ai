import { parseJsonObject, stringList } from './json.js';
import type { Draft } from './types.js';

export class WriterParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WriterParseError';
  }
}

/**
 * Ответчик работает в JSON-режиме: `messages` — сообщения клиенту по
 * порядку (при вехе — вступление к ней), `after_block` — продолжение после
 * тела вехи, остальное — служебная мета. Место вехи задаёт структура, а не
 * маркер в тексте, поэтому служебное не может утечь клиенту.
 */
export function parseWriterOutput(raw: string): Draft {
  const data = parseJsonObject(raw);
  if (!data) throw new WriterParseError('Ответчик вернул не JSON-объект');
  return {
    parts: stringList(data.messages),
    after: stringList(data.after_block ?? data.afterBlock),
    meta: {
      nudge: typeof data.nudge === 'string' && data.nudge ? data.nudge : null,
      arguments: stringList(data.arguments),
      unansweredAbout: stringList(data.unanswered_about ?? data.unansweredAbout),
      notes: typeof data.notes === 'string' ? data.notes : '',
    },
  };
}
