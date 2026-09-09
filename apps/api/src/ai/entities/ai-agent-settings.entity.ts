import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { FollowupStep, SalesScript, WorkingHours } from '../prompt/sales-script.schema.js';

/** Настройки ИИ-агента одного Telegram-аккаунта. */
@Entity({ name: 'ai_agent_settings' })
@Index(['accountId'], { unique: true })
export class AiAgentSettingsEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  /** Мастер-флаг: без него ИИ не отвечает ни в одном чате аккаунта. */
  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  /** null → провайдер из env. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  provider: string | null;

  /** null → модель из env. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  model: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  script: SalesScript;

  @Column({ name: 'working_hours', type: 'jsonb', nullable: true })
  workingHours: WorkingHours | null;

  /** Сколько секунд ждать после последнего входящего, прежде чем отвечать. */
  @Column({ name: 'debounce_sec', type: 'integer', default: 25 })
  debounceSec: number;

  /** Потолок «человеческой» задержки перед ответом. */
  @Column({ name: 'reply_delay_cap_sec', type: 'integer', default: 180 })
  replyDelayCapSec: number;

  @Column({ name: 'max_ai_messages_per_chat', type: 'integer', default: 30 })
  maxAiMessagesPerChat: number;

  @Column({ name: 'max_ai_messages_per_day', type: 'integer', default: 200 })
  maxAiMessagesPerDay: number;

  /** Сколько последних сообщений диалога отдавать модели. */
  @Column({ name: 'context_messages', type: 'integer', default: 30 })
  contextMessages: number;

  /** Останавливать ИИ в чате, когда клиент готов платить. */
  @Column({ name: 'pause_on_handoff', type: 'boolean', default: true })
  pauseOnHandoff: boolean;

  @Column({ name: 'notify_telegram', type: 'boolean', default: true })
  notifyTelegram: boolean;

  /** Кому слать алерты в Telegram: null → «Избранное» аккаунта. */
  @Column({ name: 'handoff_peer', type: 'varchar', length: 128, nullable: true })
  handoffPeer: string | null;

  @Column({ name: 'mark_read', type: 'boolean', default: true })
  markRead: boolean;

  @Column({ name: 'followups_enabled', type: 'boolean', default: true })
  followupsEnabled: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  followups: FollowupStep[];

  /** Использовать выученный из истории профиль стиля. */
  @Column({ name: 'use_learned_style', type: 'boolean', default: true })
  useLearnedStyle: boolean;

  /** Сколько похожих прошлых обменов подмешивать в промпт. */
  @Column({ name: 'retrieval_examples', type: 'integer', default: 6 })
  retrievalExamples: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
