import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  ChatMode,
  GuardConfig,
  LimitsConfig,
  PersonaConfig,
  TimingsConfig,
} from '../domain/types.js';

/** Настройки ИИ-агента одного Telegram-аккаунта (раздел 6.1 ТЗ). */
@Entity({ name: 'ai_account_settings' })
@Index(['accountId'], { unique: true })
export class AiAccountSettingsEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  /** Мастер-флаг: без него бот не делает ничего. */
  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  /** Сухой прогон: полный цикл, но в Telegram ничего не уходит. */
  @Column({ name: 'dry_run', type: 'boolean', default: true })
  dryRun: boolean;

  /** Режим для новых входящих диалогов: auto или supervised. */
  @Column({ name: 'default_chat_mode', type: 'varchar', length: 16, default: 'auto' })
  defaultChatMode: ChatMode;

  /** Старые чаты при включении: true → manager (черновики), false → off. */
  @Column({ name: 'assistant_for_existing_chats', type: 'boolean', default: true })
  assistantForExistingChats: boolean;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  persona: PersonaConfig;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  timings: TimingsConfig;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  limits: LimitsConfig;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  guard: GuardConfig;

  /** IANA-зона аккаунта: в ней считаются дневные метрики. */
  @Column({ type: 'varchar', length: 64, default: 'Europe/Moscow' })
  tz: string;

  /** Отмечать входящие прочитанными перед ответом. */
  @Column({ name: 'mark_read', type: 'boolean', default: true })
  markRead: boolean;

  /** Дублировать передачи и черновики в Telegram. */
  @Column({ name: 'notify_telegram', type: 'boolean', default: true })
  notifyTelegram: boolean;

  /** Кому слать уведомления: null → «Избранное» аккаунта. */
  @Column({ name: 'handoff_peer', type: 'varchar', length: 128, nullable: true })
  handoffPeer: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
