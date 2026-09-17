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
    language: string;
    confidence: number;
    clientIntent: string | null;
  };
  /** Есть ли в библиотеке англоязычные тексты. */
  hasEnglishTexts: boolean;
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
  if (analysis.language === 'other') return { reason: 'language', detail: 'Клиент пишет не на русском и не на английском' };
  if (analysis.language === 'en' && !input.hasEnglishTexts) {
    return { reason: 'language', detail: 'Клиент пишет на английском, а англоязычных текстов в библиотеке нет' };
  }
  if (analysis.confidence < input.confidenceThreshold) {
    return { reason: 'unsure', detail: `Модель не уверена (${analysis.confidence.toFixed(2)}): ${analysis.clientIntent ?? ''}` };
  }
  if (!input.guardOk) {
    return { reason: 'guard_failed', detail: input.guardRemark ?? 'Проверка не пройдена дважды' };
  }
  return null;
}
