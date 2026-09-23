import { describe, expect, it } from 'vitest';
import { decodeMessageCursor, encodeMessageCursor } from './message-cursor.js';

function encodeRaw(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('message cursor', () => {
  it('переживает кодирование туда и обратно', () => {
    const sentAt = new Date('2026-09-23T09:07:37.000Z');
    const cursor = decodeMessageCursor(
      encodeMessageCursor({ sentAt, telegramMessageId: 4512 }),
    );
    expect(cursor).toEqual({
      sentAt: sentAt.toISOString(),
      telegramMessageId: 4512,
    });
  });

  it('не принимает мусор', () => {
    expect(decodeMessageCursor('не-base64')).toBeNull();
    expect(decodeMessageCursor(encodeRaw([1, 2]))).toBeNull();
    expect(
      decodeMessageCursor(encodeRaw({ sentAt: 'вчера', telegramMessageId: 1 })),
    ).toBeNull();
  });

  it('пропускает в SQL только дату и неотрицательное целое', () => {
    const sentAt = '2026-09-23T09:07:37.000Z';
    expect(
      decodeMessageCursor(encodeRaw({ sentAt, telegramMessageId: '1; DROP' })),
    ).toBeNull();
    expect(
      decodeMessageCursor(encodeRaw({ sentAt, telegramMessageId: 1.5 })),
    ).toBeNull();
    expect(
      decodeMessageCursor(encodeRaw({ sentAt, telegramMessageId: -1 })),
    ).toBeNull();
  });
});
