import { describe, expect, it } from 'vitest';
import { EMPTY_STYLE_PROFILE } from '../learning/style-profile.schema.js';
import { buildConversation } from './context-window.js';
import { buildPrompt, lastClientBlock } from './prompt-builder.js';
import { DEFAULT_SALES_SCRIPT } from './sales-script.schema.js';

const at = (m: number) => new Date(Date.UTC(2026, 0, 1, 10, m));

describe('buildConversation', () => {
  it('склеивает подряд идущие ходы и чередует роли', () => {
    const result = buildConversation(
      [
        { direction: 'in', text: 'Привет', sentAt: at(0) },
        { direction: 'in', text: 'Есть кто?', sentAt: at(1) },
        { direction: 'out', text: 'Да, слушаю', sentAt: at(2) },
        { direction: 'in', text: 'Сколько стоит?', sentAt: at(3) },
      ],
      10_000,
    );
    expect(result.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(result[0].content).toBe('Привет\nЕсть кто?');
  });

  it('ведущий ход ассистента получает синтетическое начало', () => {
    const result = buildConversation([{ direction: 'out', text: 'Здравствуйте!', sentAt: at(0) }], 10_000);
    expect(result[0]).toEqual({ role: 'user', content: '[начало диалога]' });
  });

  it('медиа-заглушки переводятся в описание', () => {
    const result = buildConversation([{ direction: 'in', text: '[Фото]', sentAt: at(0) }], 10_000);
    expect(result[0].content).toBe('[клиент отправил: фото]');
  });

  it('обрезает историю по бюджету с начала', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      direction: (i % 2 === 0 ? 'in' : 'out') as 'in' | 'out',
      text: `сообщение номер ${i} `.repeat(10),
      sentAt: at(i),
    }));
    const result = buildConversation(history, 600);
    expect(result.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(600);
    expect(result[result.length - 1].content).toContain('номер 19');
  });
});

describe('buildPrompt', () => {
  const base = {
    managerName: 'Анна',
    peerName: 'Иван',
    script: { ...DEFAULT_SALES_SCRIPT, facts: ['Курс стоит 30 000 руб'] },
    profile: { ...EMPTY_STYLE_PROFILE, styleGuide: 'Пиши коротко, без точек.' },
    exchanges: [
      { id: '1', chatId: 'c', clientText: 'сколько стоит', managerText: 'курс 30 000', managerParts: 1, delaySec: 60, intent: 'price', similarity: 0.5 },
    ],
    history: [
      { direction: 'in' as const, text: 'Здравствуйте', sentAt: at(0) },
      { direction: 'out' as const, text: 'Добрый день', sentAt: at(1) },
      { direction: 'in' as const, text: 'Сколько стоит?', sentAt: at(2) },
    ],
    stage: 'qualify',
    now: new Date('2026-01-01T10:00:00Z'),
    tz: 'Europe/Moscow',
    charBudget: 12_000,
    allowMultiMessage: true,
  };

  it('стабильное — в system, изменчивое — в последнем user-ходе', () => {
    const prompt = buildPrompt({ ...base, trigger: 'inbound' });
    expect(prompt.system).toContain('Анна');
    expect(prompt.system).toContain('Пиши коротко, без точек.');
    expect(prompt.system).toContain('Курс стоит 30 000 руб');
    expect(prompt.system).not.toContain('Похожие ситуации');
    const last = prompt.messages[prompt.messages.length - 1];
    expect(last.role).toBe('user');
    expect(last.content).toContain('Похожие ситуации');
    expect(last.content).toContain('Текущий этап: qualify');
    expect(last.content).toContain('Иван');
  });

  it('дожим добавляет отдельный user-ход с описанием молчания', () => {
    const prompt = buildPrompt({
      ...base,
      history: [...base.history, { direction: 'out', text: 'Курс стоит 30 000', sentAt: at(3) }],
      trigger: 'followup',
      followup: { step: 2, total: 3, silentDays: 3, goal: 'напомнить', template: 'Как у вас дела?' },
    });
    const last = prompt.messages[prompt.messages.length - 1];
    expect(last.role).toBe('user');
    expect(last.content).toContain('касание 2 из 3');
    expect(last.content).toContain('3 дня');
    expect(last.content).toContain('Как у вас дела?');
  });

  it('хэш system стабилен при одинаковом входе', () => {
    const a = buildPrompt({ ...base, trigger: 'inbound' });
    const b = buildPrompt({ ...base, trigger: 'inbound', now: new Date('2026-02-01T10:00:00Z') });
    expect(a.systemHash).toBe(b.systemHash);
  });
});

describe('lastClientBlock', () => {
  it('возвращает последний блок сообщений клиента', () => {
    expect(
      lastClientBlock([
        { direction: 'in', text: 'а', sentAt: at(0) },
        { direction: 'out', text: 'б', sentAt: at(1) },
        { direction: 'in', text: 'в', sentAt: at(2) },
        { direction: 'in', text: 'г', sentAt: at(3) },
      ]),
    ).toBe('в\nг');
  });
});
