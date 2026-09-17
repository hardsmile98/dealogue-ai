import { describe, expect, it } from 'vitest';
import { buildNotifyText, decideStatus, glueFinalText, isOpen, sameMessages, shouldGlue } from './draft-decision.js';

describe('decideStatus', () => {
  it('тот же текст — «отправлен как есть», правка — «с правками»', () => {
    expect(decideStatus(['привет', 'как дела?'], ['привет', 'как дела?'], false)).toBe('sent_as_is');
    expect(decideStatus(['привет'], ['Привет!'], false)).toBe('edited');
    expect(decideStatus(['привет'], ['привет', 'ещё'], false)).toBe('edited');
  });

  it('«свой ответ» и черновик без текста — «заменён»', () => {
    expect(decideStatus(['привет'], ['привет'], true)).toBe('replaced');
    expect(decideStatus([], ['менеджер написал сам'], false)).toBe('replaced');
  });

  it('пробелы и переносы строк правкой не считаются', () => {
    expect(sameMessages(['привет,  как  дела?'], ['привет, как дела?\n'])).toBe(true);
  });
});

describe('склейка ответов менеджера', () => {
  const at = new Date('2026-09-17T10:00:00Z');

  it('в пределах трёх минут — одно решение, позже — новое', () => {
    expect(shouldGlue(at, new Date('2026-09-17T10:02:30Z'))).toBe(true);
    expect(shouldGlue(at, new Date('2026-09-17T10:03:30Z'))).toBe(false);
    expect(shouldGlue(null, at)).toBe(false);
  });

  it('тексты склеиваются через перенос строки', () => {
    expect(glueFinalText('первое', 'второе')).toBe('первое\nвторое');
    expect(glueFinalText(null, ' второе ')).toBe('второе');
  });
});

describe('buildNotifyText', () => {
  it('передача: причина по-русски, входящее обрезано, текста черновика нет', () => {
    const text = buildNotifyText({
      kind: 'handoff',
      reason: 'ready_to_pay',
      peerName: 'Аня',
      clientText: 'а'.repeat(200),
      link: 'https://app/accounts/1/chats/2',
    });
    expect(text).toContain('Нужен менеджер (готов оплатить)');
    expect(text).toContain('Аня: «');
    expect(text).toContain('…');
    expect(text.split('\n').at(-1)).toBe('https://app/accounts/1/chats/2');
    expect(text.length).toBeLessThan(260);
  });

  it('supervised: заголовок про подтверждение, без имени — «Клиент»', () => {
    const text = buildNotifyText({ kind: 'supervised', reason: null, peerName: ' ', clientText: '', link: 'https://app' });
    expect(text).toContain('Ход бота ждёт подтверждения');
    expect(text).toContain('Клиент');
  });
});

describe('isOpen', () => {
  it('открытые — pending и pending_classification', () => {
    expect(isOpen('pending')).toBe(true);
    expect(isOpen('pending_classification')).toBe(true);
    expect(isOpen('sent_as_is')).toBe(false);
    expect(isOpen('superseded')).toBe(false);
  });
});
