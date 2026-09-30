import { describe, expect, it } from 'vitest';
import { buildAnalyzerPrompt } from './analyzer.prompt.js';
import type { AnalyzerPromptInput } from './analyzer.prompt.js';

function userPart(patch: Partial<AnalyzerPromptInput> = {}): string {
  const [, user] = buildAnalyzerPrompt({
    memory: { card: {}, facts: [], summary: '', said: [] },
    history: [],
    messages: [
      {
        id: 1,
        text: 'Нет, расстались полгода назад',
        mediaKind: null,
        sentAt: new Date('2026-09-30T10:00:00Z'),
      },
    ],
    ...patch,
  });
  return user?.content ?? '';
}

describe('промпт анализатора', () => {
  it('имя из профиля Telegram — отдельным разделом, подсказкой для пола', () => {
    const user = userPart({ clientName: 'Анна Смирнова' });
    expect(user).toContain(
      '## Профиль клиента в Telegram (только для пола: в name, резюме и факты не пиши)\nИмя: Анна Смирнова',
    );
    // Профиль — до переписки: он не меняется от хода к ходу.
    expect(user.indexOf('Профиль клиента')).toBeLessThan(
      user.indexOf('Последние сообщения'),
    );
  });

  it('канал имени не знает — раздела нет', () => {
    expect(userPart()).not.toContain('Профиль клиента');
    expect(userPart({ clientName: null })).not.toContain('Профиль клиента');
  });
});
