import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ZodType } from 'zod';
import { AiAgentSettingsEntity } from '../entities/ai-agent-settings.entity.js';
import { AiStyleProfileEntity } from '../entities/ai-style-profile.entity.js';
import {
  StyleProfileOverridesSchema,
  StyleProfileSchema,
  applyOverrides,
} from '../learning/style-profile.schema.js';
import type { StyleProfile, StyleProfileOverrides } from '../learning/style-profile.schema.js';
import {
  DEFAULT_FOLLOWUPS,
  DEFAULT_SALES_SCRIPT,
  FollowupsSchema,
  SalesScriptSchema,
  WorkingHoursSchema,
} from '../prompt/sales-script.schema.js';
import type { FollowupStep, SalesScript, WorkingHours } from '../prompt/sales-script.schema.js';

export interface SettingsPatch {
  enabled?: boolean;
  provider?: string | null;
  model?: string | null;
  script?: unknown;
  workingHours?: unknown;
  debounceSec?: number;
  replyDelayCapSec?: number;
  maxAiMessagesPerChat?: number;
  maxAiMessagesPerDay?: number;
  contextMessages?: number;
  pauseOnHandoff?: boolean;
  notifyTelegram?: boolean;
  handoffPeer?: string | null;
  markRead?: boolean;
  followupsEnabled?: boolean;
  followups?: unknown;
  useLearnedStyle?: boolean;
  retrievalExamples?: number;
}

const SETTINGS_CACHE_MS = 30_000;

/** Настройки и профиль стиля аккаунта: get-or-create, валидация, кэш. */
@Injectable()
export class AiSettingsService {
  private readonly cache = new Map<string, { row: AiAgentSettingsEntity; at: number }>();

  constructor(
    @InjectRepository(AiAgentSettingsEntity)
    private readonly settings: Repository<AiAgentSettingsEntity>,
    @InjectRepository(AiStyleProfileEntity)
    private readonly profiles: Repository<AiStyleProfileEntity>,
  ) {}

  async getOrCreate(accountId: string): Promise<AiAgentSettingsEntity> {
    const cached = this.cache.get(accountId);
    if (cached && Date.now() - cached.at < SETTINGS_CACHE_MS) return cached.row;
    let row = await this.settings.findOne({ where: { accountId } });
    if (!row) {
      try {
        row = await this.settings.save(
          this.settings.create({ accountId, script: DEFAULT_SALES_SCRIPT, followups: DEFAULT_FOLLOWUPS }),
        );
      } catch {
        row = await this.settings.findOneOrFail({ where: { accountId } });
      }
    }
    this.cache.set(accountId, { row, at: Date.now() });
    return row;
  }

  async update(accountId: string, patch: SettingsPatch): Promise<AiAgentSettingsEntity> {
    const row = await this.getOrCreate(accountId);
    if (patch.script !== undefined) row.script = validate(SalesScriptSchema, patch.script, 'script');
    if (patch.followups !== undefined) row.followups = validate(FollowupsSchema, patch.followups, 'followups');
    if (patch.workingHours !== undefined) {
      row.workingHours = patch.workingHours === null ? null : validate(WorkingHoursSchema, patch.workingHours, 'workingHours');
    }
    if (patch.enabled !== undefined) row.enabled = patch.enabled;
    if (patch.provider !== undefined) row.provider = patch.provider || null;
    if (patch.model !== undefined) row.model = patch.model || null;
    if (patch.debounceSec !== undefined) row.debounceSec = clamp(patch.debounceSec, 5, 600);
    if (patch.replyDelayCapSec !== undefined) row.replyDelayCapSec = clamp(patch.replyDelayCapSec, 15, 3600);
    if (patch.maxAiMessagesPerChat !== undefined) row.maxAiMessagesPerChat = clamp(patch.maxAiMessagesPerChat, 1, 500);
    if (patch.maxAiMessagesPerDay !== undefined) row.maxAiMessagesPerDay = clamp(patch.maxAiMessagesPerDay, 1, 5000);
    if (patch.contextMessages !== undefined) row.contextMessages = clamp(patch.contextMessages, 4, 100);
    if (patch.pauseOnHandoff !== undefined) row.pauseOnHandoff = patch.pauseOnHandoff;
    if (patch.notifyTelegram !== undefined) row.notifyTelegram = patch.notifyTelegram;
    if (patch.handoffPeer !== undefined) row.handoffPeer = patch.handoffPeer?.trim() || null;
    if (patch.markRead !== undefined) row.markRead = patch.markRead;
    if (patch.followupsEnabled !== undefined) row.followupsEnabled = patch.followupsEnabled;
    if (patch.useLearnedStyle !== undefined) row.useLearnedStyle = patch.useLearnedStyle;
    if (patch.retrievalExamples !== undefined) row.retrievalExamples = clamp(patch.retrievalExamples, 0, 20);
    const saved = await this.settings.save(row);
    this.cache.set(accountId, { row: saved, at: Date.now() });
    return saved;
  }

  invalidate(accountId: string): void {
    this.cache.delete(accountId);
  }

  /** Скрипт с дефолтами (пустые этапы → стандартная воронка). */
  effectiveScript(row: AiAgentSettingsEntity): SalesScript {
    const parsed = SalesScriptSchema.safeParse(row.script ?? {});
    const script = parsed.success ? parsed.data : DEFAULT_SALES_SCRIPT;
    if (script.stages.length === 0) {
      return { ...script, stages: DEFAULT_SALES_SCRIPT.stages, handoffStageKey: script.handoffStageKey || 'payment' };
    }
    return script;
  }

  effectiveFollowups(row: AiAgentSettingsEntity): FollowupStep[] {
    const parsed = FollowupsSchema.safeParse(row.followups ?? []);
    return parsed.success && parsed.data.length > 0 ? parsed.data : DEFAULT_FOLLOWUPS;
  }

  effectiveWorkingHours(row: AiAgentSettingsEntity): WorkingHours | null {
    if (!row.workingHours) return null;
    const parsed = WorkingHoursSchema.safeParse(row.workingHours);
    return parsed.success ? parsed.data : null;
  }

  // --- профиль стиля --------------------------------------------------------

  async getProfile(accountId: string): Promise<AiStyleProfileEntity> {
    let row = await this.profiles.findOne({ where: { accountId } });
    if (!row) {
      try {
        row = await this.profiles.save(this.profiles.create({ accountId, profile: StyleProfileSchema.parse({}) }));
      } catch {
        row = await this.profiles.findOneOrFail({ where: { accountId } });
      }
    }
    return row;
  }

  /** Профиль с правками владельца — то, что реально видит модель. */
  effectiveProfile(row: AiStyleProfileEntity): StyleProfile {
    const parsed = StyleProfileSchema.safeParse(row.profile ?? {});
    const profile = parsed.success ? parsed.data : StyleProfileSchema.parse({});
    return applyOverrides(profile, row.overrides);
  }

  async updateOverrides(accountId: string, overrides: unknown): Promise<AiStyleProfileEntity> {
    const row = await this.getProfile(accountId);
    row.overrides = overrides === null ? null : validate<StyleProfileOverrides>(StyleProfileOverridesSchema, overrides, 'overrides');
    return this.profiles.save(row);
  }
}

function validate<T>(schema: ZodType<T>, value: unknown, field: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path?.length ? ` (${issue.path.join('.')})` : '';
    throw new BadRequestException(`${field}${path}: ${issue?.message ?? 'некорректное значение'}`);
  }
  return result.data;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
