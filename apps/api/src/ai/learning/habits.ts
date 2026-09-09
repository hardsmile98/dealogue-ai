import type { Habits, Timing } from './style-profile.schema.js';
import { MEDIA_PLACEHOLDER_RE } from './exchange-builder.js';

export interface ManagerMessageSample {
  text: string;
  sentAt: Date;
  /** Первое ли это сообщение менеджера в своём блоке-ответе. */
  opensBlock: boolean;
  closesBlock: boolean;
}

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const VOICE_RE = /^\[(Голосовое сообщение|Видеосообщение)\]$/;

/** Привычки письма менеджера — считаются кодом, без модели. */
export function computeHabits(messages: ManagerMessageSample[], multiMessageShare: number): Habits {
  const texts = messages.map((m) => m.text.trim()).filter((t) => t && !MEDIA_PLACEHOLDER_RE.test(t));
  const usesVoice = messages.some((m) => VOICE_RE.test(m.text.trim()));
  if (texts.length === 0) {
    return {
      avgMessageLen: 0,
      multiMessageShare,
      emojiTop: [],
      greetingPatterns: [],
      signoffPatterns: [],
      usesVoice,
      lowercaseStartShare: 0,
      noTrailingPeriodShare: 0,
      messageLenP90: 0,
    };
  }

  const lengths = texts.map((t) => t.length).sort((a, b) => a - b);
  const avgMessageLen = Math.round(lengths.reduce((s, n) => s + n, 0) / lengths.length);
  const messageLenP90 = percentile(lengths, 0.9);

  const lowercaseStart = texts.filter((t) => /^[a-zа-яё]/.test(t)).length / texts.length;
  const noTrailingPeriod = texts.filter((t) => !/[.!?…]$/.test(t)).length / texts.length;

  const emojiCounts = new Map<string, number>();
  for (const text of texts) {
    for (const match of text.match(EMOJI_RE) ?? []) {
      emojiCounts.set(match, (emojiCounts.get(match) ?? 0) + 1);
    }
  }
  const emojiTop = [...emojiCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([emoji]) => emoji);

  const greetingPatterns = topPrefixes(
    messages.filter((m) => m.opensBlock).map((m) => m.text),
    /^(здравствуйте|добрый|доброе|привет|хай|приветствую|день добрый)/i,
  );
  const signoffPatterns = topSuffixes(messages.filter((m) => m.closesBlock).map((m) => m.text));

  return {
    avgMessageLen,
    multiMessageShare: round2(multiMessageShare),
    emojiTop,
    greetingPatterns,
    signoffPatterns,
    usesVoice,
    lowercaseStartShare: round2(lowercaseStart),
    noTrailingPeriodShare: round2(noTrailingPeriod),
    messageLenP90,
  };
}

/** Тайминг ответов и активные часы менеджера. */
export function computeTiming(
  delaysSec: number[],
  managerSentAt: Date[],
  tz: string,
): Timing | null {
  const delays = delaysSec.filter((d) => d >= 0 && d <= 24 * 3600).sort((a, b) => a - b);
  if (delays.length < 5 || managerSentAt.length < 5) return null;

  const hourCounts = Array.from({ length: 24 }, () => 0);
  const dayCounts = Array.from({ length: 8 }, () => 0);
  for (const date of managerSentAt) {
    const { hour, day } = localParts(date, tz);
    hourCounts[hour] += 1;
    dayCounts[day] += 1;
  }
  const total = managerSentAt.length;
  const { from, to } = activeWindow(hourCounts, total);
  const activeDays = [1, 2, 3, 4, 5, 6, 7].filter((d) => dayCounts[d] / total >= 0.05);

  return {
    responseDelaySec: {
      p25: percentile(delays, 0.25),
      p50: percentile(delays, 0.5),
      p75: percentile(delays, 0.75),
      p90: percentile(delays, 0.9),
    },
    activeHours: { from, to },
    activeDays: activeDays.length > 0 ? activeDays : [1, 2, 3, 4, 5, 6, 7],
    tz,
  };
}

/** Окно часов, в которое попадает ~90% сообщений менеджера (обрезаем по 5% с краёв). */
function activeWindow(hourCounts: number[], total: number): { from: number; to: number } {
  let acc = 0;
  let from = 0;
  for (let h = 0; h < 24; h += 1) {
    acc += hourCounts[h];
    if (acc / total >= 0.05) {
      from = h;
      break;
    }
  }
  acc = 0;
  let to = 23;
  for (let h = 23; h >= 0; h -= 1) {
    acc += hourCounts[h];
    if (acc / total >= 0.05) {
      to = h;
      break;
    }
  }
  if (to <= from) return { from: Math.max(0, from - 1), to: Math.min(23, from + 10) };
  return { from, to };
}

export function localParts(date: Date, tz: string): { hour: number; day: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
      weekday: 'short',
    }).formatToParts(date);
    const hourRaw = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const hour = hourRaw === 24 ? 0 : hourRaw;
    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
    const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday) + 1 || 1;
    return { hour, day };
  } catch {
    return { hour: date.getUTCHours(), day: ((date.getUTCDay() + 6) % 7) + 1 };
  }
}

export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const index = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1));
  return sortedAsc[index];
}

function topPrefixes(texts: string[], matcher: RegExp): string[] {
  const counts = new Map<string, number>();
  for (const raw of texts) {
    const text = raw.trim();
    if (!matcher.test(text)) continue;
    const prefix = text.split(/\s+/).slice(0, 2).join(' ').replace(/[,!.]+$/, '');
    counts.set(prefix.toLowerCase(), (counts.get(prefix.toLowerCase()) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([prefix]) => prefix);
}

function topSuffixes(texts: string[]): string[] {
  const counts = new Map<string, number>();
  for (const raw of texts) {
    const text = raw.trim();
    if (!text || MEDIA_PLACEHOLDER_RE.test(text)) continue;
    const words = text.split(/\s+/);
    if (words.length < 3) continue;
    const suffix = words.slice(-2).join(' ').toLowerCase();
    if (!/[а-яё]/i.test(suffix)) continue;
    counts.set(suffix, (counts.get(suffix) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([suffix]) => suffix);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
