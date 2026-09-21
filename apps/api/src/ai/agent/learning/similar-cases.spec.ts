import { describe, expect, it } from 'vitest';
import { CASES_LIMIT, caseQuery, badOf, formatBadCases, formatSimilarCases, rankCases } from './similar-cases.js';
import type { SimilarCaseRow } from './similar-cases.js';

function row(patch: Partial<SimilarCaseRow> & { id: string }): SimilarCaseRow {
  return {
    source: 'draft',
    clientText: 'сколько стоит разбор',
    answerText: 'Стоимость обсудим после диагностики',
    stage: 'price',
    categoryKey: null,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    score: 0.5,
    outcome: 'good',
    note: null,
    ...patch,
  };
}

describe('похожие случаи', () => {
  it('слабые совпадения отбрасываются, сильные — по убыванию', () => {
    const cases = rankCases(
      [row({ id: 'a', score: 0.3 }), row({ id: 'b', score: 0.05, clientText: 'привет' }), row({ id: 'c', score: 0.7, clientText: 'а сколько это стоит' })],
      { stage: null, categoryKey: null },
    );
    expect(cases.map((c) => c.id)).toEqual(['c', 'a']);
  });

  it('совпадение этапа и категории поднимает случай выше более похожего', () => {
    const cases = rankCases(
      [
        row({ id: 'similar', score: 0.5, stage: 'offer', categoryKey: null, clientText: 'дорого для меня' }),
        row({ id: 'onStage', score: 0.3, stage: 'price', categoryKey: 'money', clientText: 'это дороговато' }),
      ],
      { stage: 'price', categoryKey: 'money' },
    );
    expect(cases[0].id).toBe('onStage');
  });

  it('при равном ранге вперёд идёт свежий', () => {
    const cases = rankCases(
      [
        row({ id: 'old', createdAt: new Date('2026-01-01T00:00:00Z'), clientText: 'а когда будет готово' }),
        row({ id: 'new', createdAt: new Date('2026-09-10T00:00:00Z'), clientText: 'когда это будет готово' }),
      ],
      { stage: null, categoryKey: null },
    );
    expect(cases[0].id).toBe('new');
  });

  it('одинаковый текст клиента берётся один раз и не больше пяти случаев', () => {
    const rows = [
      row({ id: '1', clientText: 'Сколько стоит?' }),
      row({ id: '2', clientText: 'сколько стоит' }),
      ...Array.from({ length: 8 }, (_, i) => row({ id: `x${i}`, clientText: `вопрос номер ${i}`, score: 0.4 })),
    ];
    const cases = rankCases(rows, { stage: null, categoryKey: null });
    expect(cases).toHaveLength(CASES_LIMIT);
    expect(cases.filter((c) => c.id === '2')).toHaveLength(0);
  });

  it('случай без ответа не подмешивается', () => {
    const cases = rankCases([row({ id: 'a', answerText: '   ' })], { stage: null, categoryKey: null });
    expect(cases).toEqual([]);
  });

  it('забракованные ходы идут отдельным блоком и несут пометку менеджера', () => {
    const cases = rankCases(
      [
        row({ id: 'good', source: 'turn' }),
        row({
          id: 'bad',
          source: 'turn',
          outcome: 'bad',
          note: 'слишком напористо',
          clientText: 'а сколько это будет стоить',
          answerText: 'Давайте оплатим сегодня',
        }),
      ],
      { stage: null, categoryKey: null },
    );
    expect(formatSimilarCases(cases)).toHaveLength(1);
    expect(badOf(cases).map((c) => c.id)).toEqual(['bad']);

    const [line] = formatBadCases(cases);
    expect(line).toContain('так ответили, и это не сработало');
    expect(line).toContain('слишком напористо');
  });

  it('запрос склеивает пачку и режет длинный текст', () => {
    expect(caseQuery(['привет\n\n', ' сколько стоит  разбор'])).toBe('привет сколько стоит разбор');
    expect(caseQuery(['a'.repeat(900)]).length).toBe(400);
  });

  it('в промпт уходит пара «клиент → ответ» с пометкой источника', () => {
    const cases = rankCases([row({ id: 'a', source: 'turn' })], { stage: null, categoryKey: null });
    const [line] = formatSimilarCases(cases);
    expect(line).toContain('Клиент: «сколько стоит разбор»');
    expect(line).toContain('удачный ответ');
  });
});
