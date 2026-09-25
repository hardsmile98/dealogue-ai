/** Настройки агента на аккаунте — зеркало apps/api/src/bot/bot.types.ts. */
import type { Gender, LibraryKind } from './kinds';

export interface PersonaLink {
  title: string;
  url: string;
}

/** Образ практика: от чьего лица пишет агент. */
export interface Persona {
  name: string;
  gender: Gender;
  bio: string;
  links: PersonaLink[];
}

export interface Range {
  min: number;
  max: number;
}

/** Смысл полей — apps/api/src/bot/library/timings.ts. */
export interface Timings {
  quietWindowSec: Range;
  typingExtendSec: number;
  quietMaxSec: number;
  newLeadReplySec: Range;
  inChatReplySec: Range;
  inChatWindowMin: number;
  recentReplyMin: Range;
  recentWindowMin: number;
  awayReplyMin: Range;
  typingCharsPerSec: number;
  typingMaxSec: number;
  blockTypingSec: Range;
  partPauseSec: Range;
  diagnosticDelayMin: Range;
  birthDataReminderMin: Range;
  returnQuestionMin: Range;
  stepHours: Range;
  unreadReminderHours: number;
  maxReminders: number;
  maxTurnsWithoutNudge: number;
}

export interface BotSettingsDto {
  accountId: string;
  enabled: boolean;
  enabledAt: string | null;
  persona: Persona;
  timings: Timings;
  model: string;
  /** Сколько элементов в библиотеке по видам — чтобы показать, что импорт сделан. */
  library: { total: number; byKind: Partial<Record<LibraryKind, number>> };
}

/** Тело PUT …/bot: меняется только присланное. */
export interface UpdateBotSettingsBody {
  persona?: Partial<Persona>;
  timings?: Partial<{
    [K in keyof Timings]: Timings[K] extends Range
      ? Partial<Range>
      : Timings[K];
  }>;
  model?: string;
}

/** `keep` — добавить недостающее, `replace` — вернуть стандартные тексты. */
export type LibraryImportMode = 'keep' | 'replace';

export interface LibraryImportResultDto {
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
}
