import { describe, expect, it } from 'vitest';
import { OwnOutgoing, isNewLead } from './telegram-inbox.js';

const enabledAt = new Date('2026-09-25T10:00:00Z');

describe('какие диалоги агент берёт сам', () => {
  it('только начатые клиентом после включения агента', () => {
    expect(
      isNewLead(
        {
          firstMessageDirection: 'in',
          firstMessageAt: new Date('2026-09-25T10:05:00Z'),
        },
        enabledAt,
      ),
    ).toBe(true);
    expect(
      isNewLead(
        { firstMessageDirection: 'in', firstMessageAt: enabledAt },
        enabledAt,
      ),
    ).toBe(true);
    // Старый чат, начатый нами, первое сообщение неизвестно, агент не включён.
    expect(
      isNewLead(
        {
          firstMessageDirection: 'in',
          firstMessageAt: new Date('2026-09-20T10:00:00Z'),
        },
        enabledAt,
      ),
    ).toBe(false);
    expect(
      isNewLead(
        {
          firstMessageDirection: 'out',
          firstMessageAt: new Date('2026-09-25T11:00:00Z'),
        },
        enabledAt,
      ),
    ).toBe(false);
    expect(
      isNewLead(
        { firstMessageDirection: null, firstMessageAt: null },
        enabledAt,
      ),
    ).toBe(false);
    expect(
      isNewLead(
        {
          firstMessageDirection: 'in',
          firstMessageAt: new Date('2026-09-25T11:00:00Z'),
        },
        null,
      ),
    ).toBe(false);
  });
});

describe('свои исходящие агента', () => {
  it('своё — по id отправленного или по тексту, который отправляется сейчас', () => {
    const own = new OwnOutgoing();
    const done = own.sending('c', 'Здравствуйте!');
    // Эхо пришло раньше, чем отправка вернула id.
    expect(own.isOwn('c', 101, 'Здравствуйте!')).toBe(true);
    own.sent('c', 101);
    done();
    expect(own.isOwn('c', 101, 'Здравствуйте!')).toBe(true);
    // Тот же текст, но другое сообщение и отправка закончилась — это человек.
    expect(own.isOwn('c', 102, 'Здравствуйте!')).toBe(false);
    expect(own.isOwn('other', 101, 'Здравствуйте!')).toBe(false);
  });

  it('помнит ограниченное число id', () => {
    const own = new OwnOutgoing(2);
    own.sent('c', 1);
    own.sent('c', 2);
    own.sent('c', 3);
    expect(own.isOwn('c', 1, '')).toBe(false);
    expect(own.isOwn('c', 3, '')).toBe(true);
  });
});
