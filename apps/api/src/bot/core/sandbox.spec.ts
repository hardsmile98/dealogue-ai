import { describe, expect, it } from 'vitest';
import { VirtualClock } from './channel.js';
import { findMilestones, lastAnsweredIncoming } from './copied-chat.js';
import { repliesSince } from './history.js';
import type { HistoryMessage } from './types.js';

const at = (minute: number) => new Date(Date.UTC(2026, 8, 25, 10, minute));
const msg = (
  id: number,
  direction: 'in' | 'out',
  text = '…',
): HistoryMessage => ({
  id,
  direction,
  text,
  mediaKind: null,
  sentAt: at(id),
  readAt: null,
});

describe('ответы на этапе — по истории', () => {
  const history = [
    msg(1, 'in'),
    msg(2, 'out'),
    msg(3, 'out'),
    msg(4, 'in'),
    msg(5, 'out'),
    msg(6, 'out'),
    msg(7, 'in'),
    msg(8, 'out'),
  ];

  it('с начала переписки считается каждая серия исходящих', () => {
    expect(repliesSince(history, null)).toBe(3);
    expect(repliesSince([msg(1, 'in')], null)).toBe(0);
  });

  it('после вехи: серия с самой вехой не считается', () => {
    // Веха ушла сообщением 5 вместе с 6 — это один ответ; дальше один ответ (8).
    expect(repliesSince(history, 5)).toBe(1);
    expect(repliesSince(history, 8)).toBe(0);
    // Веха вне окна истории — считаются все ответы в окне.
    expect(repliesSince(history, 999)).toBe(3);
  });
});

describe('переписка из реального чата', () => {
  const diagnostic =
    'Я провёл для вас диагностику, и готов поделиться результатами работы ❤️ Хочу подчеркнуть, что мне было приятно работать с вами';
  const prices =
    'Ознакомлю вас со стоимостью 🙌 Работа будет полностью индивидуальной, только вы и я. Это общение, переписка';

  it('вехи — по началу текста из библиотеки, без учёта переносов и эмодзи', () => {
    const history = [
      msg(1, 'in', 'Здравствуйте'),
      msg(2, 'out', 'Здравствуйте! Пришлите дату рождения'),
      msg(3, 'in', '04.01.1999'),
      msg(
        4,
        'out',
        'Я провёл для вас диагностику,\nи готов поделиться результатами работы!!! Хочу подчеркнуть, что мне было приятно работать с вами. Дальше текст менеджер поправил',
      ),
      msg(5, 'in', 'Спасибо, а сколько стоит?'),
    ];
    const found = findMilestones(history, [
      { key: 'diagnostic', text: diagnostic },
      { key: 'prices', text: prices },
    ]);
    expect(found).toEqual([{ key: 'diagnostic', messageId: 4, at: at(4) }]);
  });

  it('входящие сообщения и короткие тела не считаются', () => {
    expect(
      findMilestones([msg(1, 'in', prices)], [{ key: 'prices', text: prices }]),
    ).toEqual([]);
    expect(
      findMilestones(
        [msg(1, 'out', 'Цены')],
        [{ key: 'prices', text: 'Цены' }],
      ),
    ).toEqual([]);
  });

  it('обработанные сообщения клиента — до нашего последнего ответа', () => {
    expect(
      lastAnsweredIncoming([
        msg(1, 'in'),
        msg(2, 'out'),
        msg(3, 'in'),
        msg(4, 'in'),
      ]),
    ).toBe(1);
    expect(lastAnsweredIncoming([msg(1, 'in'), msg(2, 'in')])).toBeNull();
    expect(lastAnsweredIncoming([msg(1, 'out'), msg(2, 'in')])).toBeNull();
  });
});

describe('виртуальные часы', () => {
  it('sleep двигает время без ожидания, назад не отматывают', async () => {
    const clock = new VirtualClock(at(0));
    await clock.sleep(90_000);
    expect(clock.now()).toEqual(new Date(at(0).getTime() + 90_000));
    clock.advanceTo(at(10));
    expect(clock.now()).toEqual(at(10));
    clock.advanceTo(at(5));
    expect(clock.now()).toEqual(at(10));
    await clock.sleep(-5);
    expect(clock.now()).toEqual(at(10));
  });
});
