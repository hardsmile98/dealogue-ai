import { describe, expect, it } from 'vitest';
import { composerOutputSchema } from './composer.schema.js';

function output(analysis: Record<string, unknown>, reply: Record<string, unknown> = {}) {
  return composerOutputSchema.parse({
    analysis,
    reply: { send: true, messages: ['Здравствуйте!'], silentReason: null, ...reply },
  });
}

const FULL = {
  clientIntent: 'хочет разбор',
  card: { requestSummary: 'сомневается в партнёре' },
  escalation: null,
  stageProgress: 'advance',
  confidence: 0.9,
  replyPlan: 'Отвечу на вопрос и спрошу про дату рождения',
};

describe('схема ответа Composer', () => {
  it('разбирает полный ответ', () => {
    const parsed = output(FULL);
    expect(parsed.analysis.replyPlan).toBe('Отвечу на вопрос и спрошу про дату рождения');
    expect(parsed.analysis.card.requestSummary).toBe('сомневается в партнёре');
    expect(parsed.analysis.confidence).toBe(0.9);
  });

  /**
   * Главный риск схемы: `analysis` целиком уходит в значения по умолчанию,
   * если разбор упал. Тогда теряются карточка и эскалация — а модель нет-нет
   * да и забудет необязательное на вид поле.
   */
  it('забытое моделью поле не обнуляет разбор целиком', () => {
    for (const field of ['replyPlan', 'clientIntent']) {
      const analysis = { ...FULL };
      delete (analysis as Record<string, unknown>)[field];

      const parsed = output(analysis);
      expect(parsed.analysis.card.requestSummary, `без ${field}`).toBe('сомневается в партнёре');
      expect(parsed.analysis.confidence, `без ${field}`).toBe(0.9);
      expect(parsed.analysis.stageProgress, `без ${field}`).toBe('advance');
      expect(parsed.analysis[field as 'replyPlan'], `без ${field}`).toBeNull();
    }
  });

  it('забытый silentReason не роняет ответ', () => {
    const parsed = composerOutputSchema.parse({ analysis: FULL, reply: { send: true, messages: ['Привет'] } });
    expect(parsed.reply.messages).toEqual(['Привет']);
    expect(parsed.reply.silentReason).toBeNull();
  });

  it('мусор в отдельных полях подменяется, а не ломает ход', () => {
    const parsed = output({ ...FULL, confidence: '0.3', stageProgress: 42, escalation: { reason: 'неизвестно' } });
    expect(parsed.analysis.confidence).toBe(0.3);
    expect(parsed.analysis.stageProgress).toBe('stay');
    expect(parsed.analysis.escalation).toBeNull();
  });
});
