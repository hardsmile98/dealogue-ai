/**
 * Аномалии в работе агента (раздел 15 ТЗ). Чистая часть: пороги и решение
 * «это аномалия или обычный час». Считает цифры `StabilityService`,
 * алерт `anomaly` создаёт он же.
 */

export type AnomalyCode = 'handoff_rate' | 'regeneration_rate' | 'provider_errors' | 'chat_messages';

export interface Anomaly {
  code: AnomalyCode;
  /** Текст для менеджера. */
  detail: string;
  /** Аномалия по конкретному чату (иначе — по аккаунту). */
  chatId?: string;
}

export interface AnomalyInput {
  /** Ходы аккаунта за последний час. */
  turnsLastHour: number;
  handoffsLastHour: number;
  /** Ходы, где модель переписывала ответ после guard. */
  regenerationsLastHour: number;
  /** Исходы последних ходов, свежие первыми, — для серии ошибок провайдера. */
  recentOutcomes: string[];
  /** Чаты, где бот сегодня написал больше дневного лимита. */
  chatsOverDailyLimit: { chatId: string; count: number }[];
  /** Дневной лимит сообщений бота в чат (настройка аккаунта). */
  dailyLimit: number;
}

/** Меньше этого числа ходов за час — доли ничего не значат. */
export const MIN_TURNS = 10;
export const HANDOFF_RATE = 0.3;
export const REGENERATION_RATE = 0.4;
export const PROVIDER_ERRORS_IN_A_ROW = 5;

export function detectAnomalies(input: AnomalyInput): Anomaly[] {
  const found: Anomaly[] = [];

  if (input.turnsLastHour >= MIN_TURNS) {
    const handoffs = input.handoffsLastHour / input.turnsLastHour;
    if (handoffs > HANDOFF_RATE) {
      found.push({
        code: 'handoff_rate',
        detail: `За час ${input.handoffsLastHour} передач менеджеру из ${input.turnsLastHour} ходов (${percent(handoffs)}) — бот не справляется сам`,
      });
    }
    const regenerations = input.regenerationsLastHour / input.turnsLastHour;
    if (regenerations > REGENERATION_RATE) {
      found.push({
        code: 'regeneration_rate',
        detail: `За час ${input.regenerationsLastHour} ходов из ${input.turnsLastHour} пришлось переписывать после проверки (${percent(regenerations)})`,
      });
    }
  }

  const errors = leadingErrors(input.recentOutcomes);
  if (errors >= PROVIDER_ERRORS_IN_A_ROW) {
    found.push({ code: 'provider_errors', detail: `${errors} ходов подряд закончились ошибкой модели` });
  }

  for (const chat of input.chatsOverDailyLimit) {
    found.push({
      code: 'chat_messages',
      chatId: chat.chatId,
      detail: `Бот отправил в этот чат ${chat.count} сообщений за сутки при лимите ${input.dailyLimit}`,
    });
  }

  return found;
}

/** Сколько последних ходов подряд закончились ошибкой. */
export function leadingErrors(outcomes: string[]): number {
  let count = 0;
  for (const outcome of outcomes) {
    if (outcome !== 'error') break;
    count += 1;
  }
  return count;
}

function percent(value: number): string {
  return `${Math.round(value * 100)} %`;
}
