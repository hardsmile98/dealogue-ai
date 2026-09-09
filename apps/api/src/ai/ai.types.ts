import type { AiAgentSettingsEntity } from './entities/ai-agent-settings.entity.js';
import type { AiJobEntity, AiJobStatus, AiJobType } from './entities/ai-job.entity.js';
import type { AiRunEntity, AiRunStatus, AiRunTrigger } from './entities/ai-run.entity.js';
import type {
  AiStyleProfileEntity,
  StyleProfileProgress,
  StyleProfileSourceStats,
  StyleProfileStatus,
} from './entities/ai-style-profile.entity.js';
import type { AlertEntity, AlertPayload, AlertStatus, AlertType } from './entities/alert.entity.js';
import type { StyleProfile, StyleProfileOverrides } from './learning/style-profile.schema.js';
import type { FollowupStep, SalesScript, WorkingHours } from './prompt/sales-script.schema.js';

/**
 * Формы ответов ИИ-раздела — зеркало apps/web/src/shared/api/contracts/ai.ts
 * и alerts.ts. Менять синхронно.
 */

export interface AiSettingsDto {
  accountId: string;
  enabled: boolean;
  provider: string | null;
  model: string | null;
  script: SalesScript;
  workingHours: WorkingHours | null;
  debounceSec: number;
  replyDelayCapSec: number;
  maxAiMessagesPerChat: number;
  maxAiMessagesPerDay: number;
  contextMessages: number;
  pauseOnHandoff: boolean;
  notifyTelegram: boolean;
  handoffPeer: string | null;
  markRead: boolean;
  followupsEnabled: boolean;
  followups: FollowupStep[];
  useLearnedStyle: boolean;
  retrievalExamples: number;
  updatedAt: string;
}

export interface AiProviderInfoDto {
  name: string;
  models: string[];
  configured: boolean;
  isDefault: boolean;
}

export interface StyleProfileDto {
  accountId: string;
  version: number;
  status: StyleProfileStatus;
  progress: StyleProfileProgress | null;
  builtAt: string | null;
  sourceStats: StyleProfileSourceStats | null;
  /** Выученное как есть. */
  profile: StyleProfile;
  overrides: StyleProfileOverrides | null;
  /** Выученное с правками — то, что видит модель. */
  effective: StyleProfile;
  error: string | null;
}

export interface AiJobDto {
  id: string;
  type: AiJobType;
  status: AiJobStatus;
  runAt: string;
  attempts: number;
  maxAttempts: number;
  payload: Record<string, unknown>;
  lastError: string | null;
  updatedAt: string;
}

export interface LearningStatusDto {
  deepHistoryStatus: string;
  importJob: AiJobDto | null;
  digestJob: AiJobDto | null;
  profile: StyleProfileDto;
  estimate: { dialogs: number; chars: number; exchanges: number; thin: boolean } | null;
}

export interface AiRunDto {
  id: string;
  chatId: string;
  trigger: AiRunTrigger;
  followupStep: number | null;
  status: AiRunStatus;
  skipReason: string | null;
  decision: Record<string, unknown> | null;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
  latencyMs: number;
  error: string | null;
  createdAt: string;
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

export function toSettingsDto(row: AiAgentSettingsEntity, script: SalesScript, followups: FollowupStep[]): AiSettingsDto {
  return {
    accountId: row.accountId,
    enabled: row.enabled,
    provider: row.provider,
    model: row.model,
    script,
    workingHours: row.workingHours,
    debounceSec: row.debounceSec,
    replyDelayCapSec: row.replyDelayCapSec,
    maxAiMessagesPerChat: row.maxAiMessagesPerChat,
    maxAiMessagesPerDay: row.maxAiMessagesPerDay,
    contextMessages: row.contextMessages,
    pauseOnHandoff: row.pauseOnHandoff,
    notifyTelegram: row.notifyTelegram,
    handoffPeer: row.handoffPeer,
    markRead: row.markRead,
    followupsEnabled: row.followupsEnabled,
    followups,
    useLearnedStyle: row.useLearnedStyle,
    retrievalExamples: row.retrievalExamples,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toProfileDto(row: AiStyleProfileEntity, effective: StyleProfile, profile: StyleProfile): StyleProfileDto {
  return {
    accountId: row.accountId,
    version: row.version,
    status: row.status,
    progress: row.progress,
    builtAt: row.builtAt?.toISOString() ?? null,
    sourceStats: row.sourceStats,
    profile,
    overrides: row.overrides,
    effective,
    error: row.error,
  };
}

export function toJobDto(row: AiJobEntity): AiJobDto {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    runAt: row.runAt.toISOString(),
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    payload: publicPayload(row.payload),
    lastError: row.lastError,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Партиалы дайджеста и списки чатов наружу не отдаём — только прогресс. */
function publicPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const { progress, cancelled } = payload;
  return { ...(progress !== undefined ? { progress } : {}), ...(cancelled !== undefined ? { cancelled } : {}) };
}

export function toRunDto(row: AiRunEntity): AiRunDto {
  return {
    id: row.id,
    chatId: row.chatId,
    trigger: row.trigger,
    followupStep: row.followupStep,
    status: row.status,
    skipReason: row.skipReason,
    decision: row.decision,
    provider: row.provider,
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheHitTokens: row.cacheHitTokens,
    latencyMs: row.latencyMs,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
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
