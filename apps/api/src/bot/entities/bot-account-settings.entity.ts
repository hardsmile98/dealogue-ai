import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Настройки агента на аккаунте: включён ли, образ практика, тайминги,
 * модель. Одна строка на аккаунт, создаётся при первом обращении.
 * Формы `persona` и `timings` — в library/persona.ts и library/timings.ts:
 * читаются через readPersona / readTimings, которые терпят неполный jsonb.
 */
@Entity({ name: 'bot_account_settings' })
export class BotAccountSettingsEntity {
  @PrimaryColumn({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  /** Когда агент включили в последний раз: берёт только диалоги, начатые после. */
  @Column({ name: 'enabled_at', type: 'timestamptz', nullable: true })
  enabledAt: Date | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  persona: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  timings: Record<string, unknown>;

  @Column({ type: 'varchar', length: 64, default: 'deepseek-chat' })
  model: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
