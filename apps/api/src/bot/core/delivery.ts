import type { Timings, Range } from '../library/timings.js';
import type { Channel, Clock } from './channel.js';
import type { FinalPart, SentPart, TurnTrigger } from './types.js';

export interface DelayPlanInput {
  trigger: TurnTrigger;
  /** Ни одного нашего сообщения в чате ещё не было. */
  isNewLead: boolean;
  lastOutgoingAt: Date | null;
  now: Date;
  parts: readonly FinalPart[];
  timings: Timings;
  random?: () => number;
}

export interface DelayPlan {
  /** Пауза до «прочитано» и первой части. */
  initialMs: number;
  parts: { typingMs: number; pauseMs: number }[];
}

function pick(range: Range, random: () => number): number {
  return range.min + random() * (range.max - range.min);
}

/**
 * Задержки «как у человека с телефоном в руке» (раздел 3.8): после своего
 * сообщения практик «в чате» и отвечает быстро, после долгой паузы
 * клиента — дольше; «печатает» пропорционально длине, веха — как вставка
 * из заметок; между частями короткие паузы. Ход по расписанию без задержки.
 */
export function planDelays(input: DelayPlanInput): DelayPlan {
  const random = input.random ?? Math.random;
  const { timings } = input;
  let initialSec = 0;
  if (input.trigger === 'client') {
    if (input.isNewLead || !input.lastOutgoingAt) {
      initialSec = pick(timings.newLeadReplySec, random);
    } else {
      const sinceOutMin = (input.now.getTime() - input.lastOutgoingAt.getTime()) / 60_000;
      if (sinceOutMin <= timings.inChatWindowMin) initialSec = pick(timings.inChatReplySec, random);
      else if (sinceOutMin <= timings.recentWindowMin) initialSec = pick(timings.recentReplyMin, random) * 60;
      else initialSec = pick(timings.awayReplyMin, random) * 60;
    }
  }
  const parts = input.parts.map((part, index) => ({
    typingMs: Math.round(
      (part.block
        ? pick(timings.blockTypingSec, random)
        : Math.min(part.text.length / Math.max(1, timings.typingCharsPerSec), timings.typingMaxSec)) * 1000,
    ),
    pauseMs: index === 0 ? 0 : Math.round(pick(timings.partPauseSec, random) * 1000),
  }));
  return { initialMs: Math.round(initialSec * 1000), parts };
}

export interface DeliverInput {
  chatId: string;
  parts: readonly FinalPart[];
  delays: DelayPlan;
  /** Ставить «прочитано» перед ответом — только в ходе клиента. */
  markRead: boolean;
  /** Ход устарел (клиент дописал): оставшиеся части не отправляются. */
  isStale: () => boolean;
}

/** Доставка по плану задержек; возвращает, что реально ушло. Устаревший ход останавливается между частями. */
export async function deliver(input: DeliverInput, channel: Channel, clock: Clock): Promise<{ sent: SentPart[]; aborted: boolean }> {
  const sent: SentPart[] = [];
  await clock.sleep(input.delays.initialMs);
  if (input.isStale()) return { sent, aborted: true };
  if (input.markRead) await channel.markRead(input.chatId);

  for (let index = 0; index < input.parts.length; index++) {
    const part = input.parts[index] as FinalPart;
    const delay = input.delays.parts[index] ?? { typingMs: 0, pauseMs: 0 };
    if (delay.pauseMs > 0) await clock.sleep(delay.pauseMs);
    if (input.isStale()) return { sent, aborted: true };
    await channel.setTyping(input.chatId, true);
    await clock.sleep(delay.typingMs);
    if (input.isStale()) {
      await channel.setTyping(input.chatId, false);
      return { sent, aborted: true };
    }
    const { messageId } = await channel.send(input.chatId, part.text);
    sent.push({
      text: part.text,
      block: part.block,
      messageId,
      delayMs: index === 0 ? input.delays.initialMs : delay.pauseMs,
      typingMs: delay.typingMs,
      sentAt: clock.now(),
    });
  }
  return { sent, aborted: false };
}
