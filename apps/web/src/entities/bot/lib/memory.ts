import type { BotMemoryDto } from '@/shared/api';
import { CARD_LABELS, CARD_VALUE_LABELS } from './labels';

export interface CardField {
  key: string;
  label: string;
  value: string;
}

/** Ниже этой уверенности факт помечается «не точно». */
export const CONFIDENT_FACT = 0.8;

interface RawCardField {
  value?: unknown;
  confidence?: unknown;
}

/**
 * Карточка клиента для показа. В контракте она — `Record<string, unknown>`
 * (поле → `{ value, confidence }`), поэтому разбираем осторожно: пустые
 * поля пропускаем, неуверенные помечаем процентом.
 */
export function readCard(card: BotMemoryDto['card']): CardField[] {
  return Object.entries(card).flatMap(([key, raw]) => {
    if (typeof raw !== 'object' || raw === null) return [];
    const field = raw as RawCardField;
    if (field.value === undefined || field.value === null) return [];
    const confidence =
      typeof field.confidence === 'number' && field.confidence < 1
        ? ` (${Math.round(field.confidence * 100)}%)`
        : '';
    const value = String(field.value);
    return [
      {
        key,
        label: CARD_LABELS[key] ?? key,
        value: `${CARD_VALUE_LABELS[key]?.[value] ?? value}${confidence}`,
      },
    ];
  });
}

/** Реестр сказанного: доставленные вехи отдельно от прочего. */
export function splitSaid(said: BotMemoryDto['said']) {
  return {
    milestones: said.filter((entry) => entry.kind === 'milestone'),
    other: said.filter((entry) => entry.kind !== 'milestone'),
  };
}
