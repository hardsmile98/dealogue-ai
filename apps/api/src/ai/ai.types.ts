import type {
  ChatMode,
  GuardConfig,
  LimitsConfig,
  NightWindowConfig,
  PersonaConfig,
  TimingsConfig,
} from './domain/types.js';
import type { AiAccountSettingsEntity } from './entities/ai-account-settings.entity.js';
import type { AlertEntity, AlertPayload, AlertStatus, AlertType } from './entities/alert.entity.js';

/**
 * Формы ответов ИИ-раздела — зеркало apps/web/src/shared/api/contracts/ai.ts
 * и alerts.ts. Менять синхронно.
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
  nightWindow: NightWindowConfig;
  markRead: boolean;
  notifyTelegram: boolean;
  handoffPeer: string | null;
  updatedAt: string;
}

export interface AiProviderInfoDto {
  name: string;
  models: string[];
  configured: boolean;
  isDefault: boolean;
}

export interface AlertDto {
  id: string;
  accountId: string;
  chatId: string | null;
  type: AlertType;
  status: AlertStatus;
  payload: AlertPayload;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  /** Для списка: имя собеседника и аккаунт. */
  chat: { peerName: string; peerUsername: string | null } | null;
  account: { displayName: string; phone: string } | null;
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
    nightWindow: row.nightWindow,
    markRead: row.markRead,
    notifyTelegram: row.notifyTelegram,
    handoffPeer: row.handoffPeer,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAlertDto(
  row: AlertEntity,
  chat: { peerName: string; peerUsername: string | null } | null,
  account: { displayName: string; phone: string } | null,
): AlertDto {
  return {
    id: row.id,
    accountId: row.accountId,
    chatId: row.chatId,
    type: row.type,
    status: row.status,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    chat,
    account,
  };
}
