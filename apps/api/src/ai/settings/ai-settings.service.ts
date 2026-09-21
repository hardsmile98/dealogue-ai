import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { AiConfig } from '../ai.config.js';
import {
  DEFAULT_GUARD,
  DEFAULT_LIMITS,
  DEFAULT_PERSONA,
  DEFAULT_TIMINGS,
  DEFAULT_TZ,
  accountDefaults,
  withDefaults,
} from '../domain/defaults.js';
import type { UpdateSettingsInput } from './ai-settings.schema.js';
import { AiAccountSettingsEntity } from '../entities/ai-account-settings.entity.js';
import { AiEventEntity } from '../entities/ai-event.entity.js';

/** Настройки аккаунта: создаются лениво с дефолтами, jsonb-блоки всегда полные. */
@Injectable()
export class AiSettingsService {
  constructor(
    @InjectRepository(AiAccountSettingsEntity)
    private readonly settings: Repository<AiAccountSettingsEntity>,
    @InjectRepository(AiEventEntity)
    private readonly events: Repository<AiEventEntity>,
    private readonly config: AiConfig,
    private readonly realtime: RealtimeService,
  ) {}

  async get(accountId: string): Promise<AiAccountSettingsEntity> {
    const existing = await this.settings.findOne({ where: { accountId } });
    if (existing) return this.normalize(existing);
    try {
      const created = await this.settings.save(
        this.settings.create({ accountId, ...accountDefaults(this.config.defaultDryRun) }),
      );
      return this.normalize(created);
    } catch {
      // Гонка двух первых запросов — берём победителя.
      const winner = await this.settings.findOne({ where: { accountId } });
      if (!winner) throw new Error('Не удалось создать настройки ИИ');
      return this.normalize(winner);
    }
  }

  async update(accountId: string, input: UpdateSettingsInput, byUserId: string): Promise<AiAccountSettingsEntity> {
    const row = await this.get(accountId);
    const before = { enabled: row.enabled, dryRun: row.dryRun, mode: row.defaultChatMode };

    if (input.enabled !== undefined) row.enabled = input.enabled;
    if (input.dryRun !== undefined) row.dryRun = input.dryRun;
    if (input.defaultChatMode !== undefined) row.defaultChatMode = input.defaultChatMode;
    if (input.assistantForExistingChats !== undefined) row.assistantForExistingChats = input.assistantForExistingChats;
    if (input.markRead !== undefined) row.markRead = input.markRead;
    if (input.notifyTelegram !== undefined) row.notifyTelegram = input.notifyTelegram;
    if (input.handoffPeer !== undefined) row.handoffPeer = input.handoffPeer?.trim() || null;
    if (input.tz !== undefined) row.tz = input.tz.trim() || DEFAULT_TZ;
    if (input.persona) row.persona = withDefaults(row.persona, input.persona);
    if (input.timings) row.timings = withDefaults(row.timings, input.timings);
    if (input.limits) row.limits = withDefaults(row.limits, input.limits);
    if (input.guard) row.guard = withDefaults(row.guard, input.guard);

    this.assertConsistent(row);
    const saved = await this.settings.save(row);

    await this.events.save(
      this.events.create({
        accountId,
        chatId: null,
        kind: 'settings_changed',
        payload: { byUserId, before, after: { enabled: saved.enabled, dryRun: saved.dryRun, mode: saved.defaultChatMode } },
      }),
    );
    await this.realtime.publishForAccount(accountId, { type: 'settings.updated', accountId });
    return saved;
  }

  // --- внутреннее -----------------------------------------------------------

  /** Старые строки могут не содержать новых ключей jsonb — дополняем дефолтами. */
  private normalize(row: AiAccountSettingsEntity): AiAccountSettingsEntity {
    row.persona = withDefaults(DEFAULT_PERSONA, row.persona);
    row.timings = withDefaults(DEFAULT_TIMINGS, row.timings);
    row.limits = withDefaults(DEFAULT_LIMITS, row.limits);
    row.guard = withDefaults(DEFAULT_GUARD, row.guard);
    row.tz = row.tz || DEFAULT_TZ;
    return row;
  }

  private assertConsistent(row: AiAccountSettingsEntity): void {
    const t = row.timings;
    if (t.firstReplyDelayMinSec > t.firstReplyDelayMaxSec) {
      throw new BadRequestException('Минимальная задержка первого ответа больше максимальной');
    }
    if (t.touchIntervalMinHours > t.touchIntervalMaxHours) {
      throw new BadRequestException('Минимальный интервал касаний больше максимального');
    }
    if (t.debounceSec > t.debounceMaxSec) {
      throw new BadRequestException('Окно тишины больше максимального ожидания пачки');
    }
  }
}
