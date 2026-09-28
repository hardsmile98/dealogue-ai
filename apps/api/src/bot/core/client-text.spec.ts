import { describe, expect, it } from 'vitest';
import { MILESTONE_TITLES } from '../library/kinds.js';
import {
  AD_CODE_ONLY,
  cleanClientText,
  clientTextForPrompt,
} from './client-text.js';
import { formatHistory } from './history.js';

describe('текст клиента для промптов', () => {
  it.each([
    [
      'Здравствуйте! Хочу бесплатный расклад, код 12',
      'Здравствуйте! Хочу бесплатный расклад',
    ],
    [
      'Здравствуйте Марсель! Хочу получить бесплатный расклад от Вас! код: 12',
      'Здравствуйте Марсель! Хочу получить бесплатный расклад от Вас!',
    ],
    ['Хочу расклад код12', 'Хочу расклад'],
    ['код №3 здравствуйте', 'здравствуйте'],
    ['#12 Хочу расклад', 'Хочу расклад'],
    ['Хочу расклад #5!', 'Хочу расклад!'],
    ['Здравствуйте, код 12, хочу расклад', 'Здравствуйте, хочу расклад'],
    ['Hello, code 7', 'Hello'],
  ])('рекламная метка убирается: %s', (raw, clean) => {
    expect(cleanClientText(raw)).toBe(clean);
  });

  it('невидимые символы рекламы убираются', () => {
    expect(cleanClientText('З\u200B\u200D\u2060дравствуйте')).toBe(
      'Здравствуйте',
    );
  });

  it('обычный текст и числа не трогаются', () => {
    for (const text of [
      'Мне 35 лет, родилась 04.01.1999',
      'штрихкод 12',
      'Стал мало зарабатывать',
      '',
    ]) {
      expect(cleanClientText(text)).toBe(text);
    }
  });

  it('сообщение из одной метки — пометка, пустое остаётся пустым', () => {
    expect(clientTextForPrompt('Код 12')).toBe(AD_CODE_ONLY);
    expect(clientTextForPrompt('')).toBe('');
  });

  it('в истории метка убирается только у сообщений клиента', () => {
    const at = new Date('2026-09-25T10:00:00Z');
    const lines = formatHistory(
      [
        {
          id: 1,
          direction: 'in',
          text: 'Хочу расклад, код 12',
          mediaKind: null,
          sentAt: at,
          readAt: null,
        },
        {
          id: 2,
          direction: 'out',
          text: 'Мой код 7 в нумерологии',
          mediaKind: null,
          sentAt: at,
          readAt: null,
        },
      ],
      [],
      MILESTONE_TITLES,
    );
    expect(lines.map((line) => line.text)).toEqual([
      'Хочу расклад',
      'Мой код 7 в нумерологии',
    ]);
  });
});
