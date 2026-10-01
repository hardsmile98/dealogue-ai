import { describe, expect, it } from 'vitest';
import type { HistoryLine } from '../core/history.js';
import type { Plan } from '../core/types.js';
import {
  REVIEWER_HISTORY,
  buildReviewerPrompt,
  parseReview,
} from './reviewer.prompt.js';
import type { ReviewerPromptInput } from './reviewer.prompt.js';

const plan = {
  goal: 'Шаг воронки: спроси, рассказать ли, как это можно проработать.',
  constraints: { language: 'ru', maxParts: 1 },
  milestone: null,
} as unknown as Plan;

const line = (role: HistoryLine['role'], text: string): HistoryLine => ({
  role,
  text,
  sentAt: new Date('2026-10-01T10:00:00Z'),
});

function userPart(patch: Partial<ReviewerPromptInput> = {}): string {
  const [, user] = buildReviewerPrompt({
    persona: { name: 'Марсель', gender: 'm', bio: '', links: [] },
    about: [],
    memory: { card: {}, facts: [], summary: '', said: [] },
    plan,
    messages: [
      {
        id: 1,
        text: 'Сама, пока не очень получается',
        mediaKind: null,
        sentAt: new Date('2026-10-01T10:00:00Z'),
      },
    ],
    parts: ['Понимаю. Хотите, расскажу, как это можно проработать?'],
    ...patch,
  });
  return user?.content ?? '';
}

describe('промпт проверяющего', () => {
  it('видит последние сообщения переписки — на что отвечает клиент', () => {
    const history = [
      line('client', 'старое сообщение'),
      ...Array.from({ length: REVIEWER_HISTORY - 2 }, (_, index) =>
        line('practitioner', `реплика ${index}`),
      ),
      line('practitioner', 'А как у вас с этим получается?'),
      line('client', 'Сама, пока не очень получается'),
    ];
    const user = userPart({ history });
    expect(user).toContain('## Последние сообщения переписки');
    expect(user).toContain('Ты: А как у вас с этим получается?');
    // Только хвост: старшие сообщения держит память.
    expect(user).not.toContain('старое сообщение');
    expect(user.indexOf('Последние сообщения переписки')).toBeLessThan(
      user.indexOf('## Новые сообщения клиента'),
    );
  });

  it('истории нет — раздела нет', () => {
    expect(userPart()).not.toContain('Последние сообщения переписки');
    expect(userPart({ history: [] })).not.toContain(
      'Последние сообщения переписки',
    );
  });

  it('переспрос сказанного и отклик мимо слов клиента — грубые: ответчик переписывает', () => {
    const review = parseReview(
      JSON.stringify({
        violations: [
          { code: 'asks_known', detail: 'спрашивает, сама ли она работает' },
          { code: 'generic_reply', detail: 'общая фраза мимо её ответа' },
        ],
      }),
    );
    expect(review.violations.map((item) => item.severity)).toEqual([
      'hard',
      'hard',
    ]);
  });
});
