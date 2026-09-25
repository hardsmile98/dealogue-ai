import { toDayKey } from '@/shared/lib';
import type { Message } from '@/entities/chat';

export interface DayGroup {
  /** `YYYY-MM-DD` в зоне браузера. */
  day: string;
  messages: Message[];
}

/** Режет упорядоченную по времени переписку на дни — для разделителей в ленте. */
export function groupByDay(messages: Message[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const message of messages) {
    const day = toDayKey(message.sentAt);
    const last = groups.at(-1);
    if (last?.day === day) last.messages.push(message);
    else groups.push({ day, messages: [message] });
  }
  return groups;
}
