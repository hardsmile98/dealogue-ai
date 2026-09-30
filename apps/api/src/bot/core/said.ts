import { OBJECTION_MARKERS } from './types.js';
import type {
  FinalPart,
  ObjectionEnd,
  Plan,
  SaidEntry,
  SentPart,
} from './types.js';

export interface SaidInput {
  /** `coveredNudges` может не быть у ходов, записанных до его появления. */
  plan: Pick<Plan, 'milestone' | 'nudge' | 'objection'> &
    Partial<Pick<Plan, 'coveredNudges'>>;
  /** Части к отправке — по ним находится тело вехи. */
  parts: readonly FinalPart[];
  /** Что реально ушло; часть с тем же индексом, что в `parts`. */
  sent: readonly SentPart[];
  /** Вместо текста ответчика ушла запасная фраза — шага воронки она не делает. */
  fallback: boolean;
  /**
   * Вместо текста ответчика ушла фраза шага из таблиц как есть: шаг сделан,
   * а отработки возражения в ней не было.
   */
  stepOnly?: boolean;
}

/**
 * Реестр сказанного по итогу хода (docs/agent-architecture.md, 3.9 и 4) —
 * только то, что реально ушло: веха (и ссылки вместе с вехой `links`) —
 * если ушло её тело; шаг воронки (и шаги, которые он сделал заодно) — если
 * ушло последнее сообщение ответчика, в нём шаг; подход к возражению и
 * отметка его исхода (`OBJECTION_MARKERS`) — если ушло первое. Ход
 * прервали посередине — несделанный шаг не считается сделанным. Запасная
 * фраза шага воронки не делает; фраза шага из таблиц — шаг без отработки.
 */
export function saidEntries(input: SaidInput): Omit<SaidEntry, 'at'>[] {
  const { plan, parts, sent, fallback } = input;
  const entries: Omit<SaidEntry, 'at'>[] = [];
  if (sent.length === 0) return entries;

  const blockSent = sent[parts.findIndex((part) => part.block)];
  if (plan.milestone && blockSent) {
    entries.push({
      kind: 'milestone',
      key: plan.milestone.key,
      messageId: blockSent.messageId,
    });
    if (plan.milestone.key === 'links') {
      entries.push({
        kind: 'link',
        key: 'pages',
        messageId: blockSent.messageId,
      });
    }
  }
  if (fallback) return entries;

  // Сообщения ответчика по порядку: ответы и возражение — первое, шаг — последнее.
  const own = parts.flatMap((part, index) => (part.block ? [] : [index]));
  const stepPart = sent[own[own.length - 1] ?? sent.length];
  const answerPart = sent[own[0] ?? sent.length];
  if (plan.nudge && stepPart) {
    for (const key of [plan.nudge, ...(plan.coveredNudges ?? [])]) {
      entries.push({ kind: 'nudge', key, messageId: stepPart.messageId });
    }
  }
  if (plan.objection && !input.stepOnly && answerPart) {
    entries.push({
      kind: 'argument',
      key: `${plan.objection.category}:${plan.objection.approach}`,
      messageId: answerPart.messageId,
    });
    // Чем кончилась отработка: следующий ответ клиента читается по ней
    // (раздел 2.5). У ходов, собранных до 30.09, исхода нет.
    const ends = plan.objection.ends as ObjectionEnd | undefined;
    const marker = ends && ends !== 'step' ? OBJECTION_MARKERS[ends] : null;
    if (marker) {
      entries.push({
        kind: 'nudge',
        key: marker,
        messageId: answerPart.messageId,
      });
    }
  }
  return entries;
}
