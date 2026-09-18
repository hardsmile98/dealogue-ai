import type { ChatMode, GuardConfig, LimitsConfig, PersonaConfig, TimingsConfig } from '../domain/types.js';
import type { AiAccountSettingsEntity } from '../entities/ai-account-settings.entity.js';

/**
 * Настройки ИИ-агента наружу — зеркало apps/web/src/shared/api/contracts/ai.
 * Менять синхронно.
 */
export interface AiSettingsDto {
  accountId: string;
  enabled: boolean;
  dryRun: boolean;
  defaultChatMode: ChatMode;
  assistantForExistingChats: boolean;
  persona: PersonaConfig;
  timings: TimingsConfig;
  limits: LimitsConfig;
  guard: GuardConfig;
  tz: string;
  markRead: boolean;
  notifyTelegram: boolean;
  handoffPeer: string | null;
  updatedAt: string;
}

export function toSettingsDto(row: AiAccountSettingsEntity): AiSettingsDto {
  return {
    accountId: row.accountId,
    enabled: row.enabled,
    dryRun: row.dryRun,
    defaultChatMode: row.defaultChatMode,
    assistantForExistingChats: row.assistantForExistingChats,
    persona: row.persona,
    timings: row.timings,
    limits: row.limits,
    guard: row.guard,
    tz: row.tz,
    markRead: row.markRead,
    notifyTelegram: row.notifyTelegram,
    handoffPeer: row.handoffPeer,
    updatedAt: row.updatedAt.toISOString(),
  };
}
