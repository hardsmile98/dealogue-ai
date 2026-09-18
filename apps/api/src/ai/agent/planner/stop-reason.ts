/**
 * Стоп-триггеры по результату модели (раздел 8.1 ТЗ): что из ответа
 * Composer означает «бот дальше не пишет, зовём человека». Чистая часть —
 * чтобы правило можно было прогнать на фикстурах прошлых диалогов.
 */

import type { HandoffReason } from '../../domain/types.js';

export interface StopInput {
  /** Возраст < 18 — код посчитал до модели. */
  isMinor: boolean;
  analysis: {
    escalation: { reason: HandoffReason; note: string | null } | null;
    confidence: number;
    clientIntent: string | null;
  };
  /** Язык клиента из карточки. */
  language: string;
  /** Языки, на которых в библиотеке вообще есть тексты; пустой список — библиотека пуста. */
  libraryLanguages: string[];
  /** Guard пропустил ответ (сам или после регенерации). */
  guardOk: boolean;
  /** Замечания guard последней попытки — в текст передачи. */
  guardRemark: string | null;
  confidenceThreshold: number;
}

export interface StopVerdict {
  reason: HandoffReason;
  detail: string;
}

export function stopReason(input: StopInput): StopVerdict | null {
  const { analysis } = input;
  if (input.isMinor) return { reason: 'minor', detail: 'Клиент несовершеннолетний' };
  if (analysis.escalation) {
    return {
      reason: analysis.escalation.reason,
      detail: analysis.escalation.note ?? analysis.clientIntent ?? analysis.escalation.reason,
    };
  }
  // Пустая библиотека — не повод отдавать чат по языку: это ловит library_incomplete.
  if (input.libraryLanguages.length > 0 && !input.libraryLanguages.includes(input.language)) {
    return { reason: 'language', detail: `Клиент пишет на «${input.language}», а текстов на этом языке в библиотеке нет` };
  }
  if (analysis.confidence < input.confidenceThreshold) {
    return { reason: 'unsure', detail: `Модель не уверена (${analysis.confidence.toFixed(2)}): ${analysis.clientIntent ?? ''}` };
  }
  if (!input.guardOk) {
    return { reason: 'guard_failed', detail: input.guardRemark ?? 'Проверка не пройдена дважды' };
  }
  return null;
}
