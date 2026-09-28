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
 * порядку, остальное — служебная мета. Тело вехи код ставит после
 * `messages` сам, поэтому служебное не может утечь клиенту.
 */
export function parseWriterOutput(raw: string): Draft {
  const data = parseJsonObject(raw);
  if (!data) throw new WriterParseError('Ответчик вернул не JSON-объект');
  return {
    parts: stringList(data.messages),
    meta: {
      arguments: stringList(data.arguments),
      notes: typeof data.notes === 'string' ? data.notes : '',
    },
  };
}
