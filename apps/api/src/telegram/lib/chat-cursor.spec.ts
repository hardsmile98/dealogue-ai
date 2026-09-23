import { describe, expect, it } from 'vitest';
import { decodeChatCursor, encodeChatCursor } from './chat-cursor.js';

const ID = '202f0a4d-6052-4ca3-8db9-ea3ff43c0222';

function encodeRaw(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('chat cursor', () => {
  it('переживает кодирование туда и обратно', () => {
    const lastMessageAt = new Date('2026-09-23T08:46:10.000Z');
    const cursor = decodeChatCursor(
      encodeChatCursor({ lastMessageAt, id: ID }),
    );
    expect(cursor).toEqual({
      lastMessageAt: lastMessageAt.toISOString(),
      id: ID,
    });
  });

  it('помнит чат без сообщений', () => {
    expect(
      decodeChatCursor(encodeChatCursor({ lastMessageAt: null, id: ID })),
    ).toEqual({
      lastMessageAt: null,
      id: ID,
    });
  });

  it('не принимает мусор', () => {
    expect(decodeChatCursor('не-base64')).toBeNull();
    expect(decodeChatCursor(encodeRaw('строка'))).toBeNull();
    expect(decodeChatCursor(encodeRaw({ lastMessageAt: null }))).toBeNull();
  });

  it('не пропускает в SQL ничего, кроме uuid и даты', () => {
    expect(
      decodeChatCursor(encodeRaw({ lastMessageAt: null, id: "1' OR 1=1 --" })),
    ).toBeNull();
    expect(
      decodeChatCursor(encodeRaw({ lastMessageAt: 'вчера', id: ID })),
    ).toBeNull();
    expect(
      decodeChatCursor(encodeRaw({ lastMessageAt: 42, id: ID })),
    ).toBeNull();
  });
});
