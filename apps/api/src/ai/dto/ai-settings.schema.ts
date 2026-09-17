import { z } from 'zod';

/**
 * Валидация PUT /ai/settings. Все поля необязательны: присланное сливается
 * с текущими настройками, пропущенное не трогается.
 */

export const personaSchema = z.object({
  name: z.string().max(64),
  gender: z.enum(['f', 'm']),
  bio: z.string().max(4000),
  tone: z.string().max(1000),
  habits: z.string().max(2000),
  city: z.string().max(128),
  language: z.string().min(2).max(8),
  links: z.array(z.object({ title: z.string().max(64), url: z.string().url().max(512) })).max(20),
});

export const timingsSchema = z.object({
  debounceSec: z.number().int().min(10).max(600),
  debounceMaxSec: z.number().int().min(30).max(900),
  greetingDebounceMaxSec: z.number().int().min(30).max(300),
  firstReplyDelayMinSec: z.number().int().min(0).max(300),
  firstReplyDelayMaxSec: z.number().int().min(0).max(300),
  birthNudgeAfterMin: z.number().int().min(5).max(240),
  diagnosticsDelayMin: z.number().int().min(5).max(600),
  reengageAfterReadMin: z.number().int().min(5).max(600),
  reengageIfUnreadHours: z.number().min(1).max(168),
  touchIntervalMinHours: z.number().min(1).max(168),
  touchIntervalMaxHours: z.number().min(1).max(168),
  maxReminders: z.number().int().min(0).max(10),
  superviseTimeoutHours: z.number().min(1).max(168),
});

export const limitsSchema = z.object({
  llmCallsPerHour: z.number().int().min(1).max(10_000),
  llmCallsPerDay: z.number().int().min(1).max(100_000),
  botMessagesPerHour: z.number().int().min(1).max(1000),
  botMessagesPerChatPerDay: z.number().int().min(1).max(100),
  autoMessagesWithoutReply: z.number().int().min(1).max(20),
});

export const guardSchema = z.object({
  botAdmissionPhrases: z.array(z.string().max(64)).max(100),
  promisePhrases: z.array(z.string().max(64)).max(100),
  similarityThreshold: z.number().min(0.3).max(1),
  confidenceThreshold: z.number().min(0).max(1),
});

export const updateSettingsSchema = z
  .object({
    enabled: z.boolean(),
    dryRun: z.boolean(),
    defaultChatMode: z.enum(['auto', 'supervised']),
    assistantForExistingChats: z.boolean(),
    persona: personaSchema.partial(),
    timings: timingsSchema.partial(),
    limits: limitsSchema.partial(),
    guard: guardSchema.partial(),
    tz: z.string().min(1).max(64),
    markRead: z.boolean(),
    notifyTelegram: z.boolean(),
    handoffPeer: z.string().max(128).nullable(),
  })
  .partial()
  .strict();

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
