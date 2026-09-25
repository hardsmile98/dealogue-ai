import type { FinalPart, Plan, SaidEntry, SentPart } from './types.js';

/** Длина ключа в реестре сказанного (bot_chat_said.key). */
const KEY_MAX_LENGTH = 64;

export interface SaidInput {
  plan: Pick<Plan, 'milestone' | 'nudge' | 'objection'>;
  /** Аргументы плейбука, которые ответчик назвал использованными. */
  writerArguments: readonly string[];
  /** Части к отправке — по ним находится тело вехи. */
  parts: readonly FinalPart[];
  /** Что реально ушло; часть с тем же индексом, что в `parts`. */
  sent: readonly SentPart[];
  /** Вместо текста ответчика ушла запасная фраза — шага воронки она не делает. */
  fallback: boolean;
}

/**
 * Реестр сказанного по итогу хода (docs/agent-architecture.md, 3.9 и 4):
 * доставленная веха (и ссылки вместе с вехой `links`), подталкивание,
 * подход к возражению и аргументы ответчика. Ничего не ушло — ничего не
 * сказано. Запасная фраза шага воронки не делает: подталкивание, подход и
 * аргументы в реестр не попадают, веха (она уходит сама) — попадает.
 */
export function saidEntries(input: SaidInput): Omit<SaidEntry, 'at'>[] {
  const { plan, parts, sent, fallback } = input;
  const entries: Omit<SaidEntry, 'at'>[] = [];
  const lastSent = sent[sent.length - 1];
  if (!lastSent) return entries;

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

  if (plan.nudge && plan.nudge !== 'skip') {
    entries.push({
      kind: 'nudge',
      key: plan.nudge,
      messageId: lastSent.messageId,
    });
  }
  if (plan.objection) {
    entries.push({
      kind: 'argument',
      key: `${plan.objection.category}:${plan.objection.approach}`,
      messageId: lastSent.messageId,
    });
  }
  for (const argument of input.writerArguments) {
    if (
      !entries.some(
        (entry) => entry.kind === 'argument' && entry.key === argument,
      )
    ) {
      entries.push({
        kind: 'argument',
        key: argument.slice(0, KEY_MAX_LENGTH),
        messageId: lastSent.messageId,
      });
    }
  }
  return entries;
}
