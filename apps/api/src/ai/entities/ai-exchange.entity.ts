import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Один «обмен» из истории: блок подряд идущих сообщений клиента и блок
 * ответов менеджера на него. Индекс для подбора похожих ситуаций в промпт
 * и источник статистики о времени ответа. Сообщения ИИ сюда не попадают.
 */
@Entity({ name: 'ai_exchanges' })
@Index(['accountId', 'intent'])
@Index(['chatId', 'clientMessageId'], { unique: true })
export class AiExchangeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ name: 'chat_id', type: 'uuid' })
  chatId: string;

  /** telegram_message_id первого сообщения клиента в блоке. */
  @Column({ name: 'client_message_id', type: 'integer' })
  clientMessageId: number;

  @Column({ name: 'client_text', type: 'text' })
  clientText: string;

  /** Ответ менеджера (несколько сообщений — через перевод строки). */
  @Column({ name: 'manager_text', type: 'text' })
  managerText: string;

  /** Сколько сообщений менеджер написал подряд в этом ответе. */
  @Column({ name: 'manager_parts', type: 'smallint', default: 1 })
  managerParts: number;

  @Column({ name: 'client_at', type: 'timestamptz' })
  clientAt: Date;

  @Column({ name: 'manager_at', type: 'timestamptz' })
  managerAt: Date;

  /** Через сколько секунд менеджер ответил. */
  @Column({ name: 'delay_sec', type: 'integer' })
  delaySec: number;

  /** Намерение по классификации дайджеста (см. PHRASE_INTENTS). */
  @Column({ type: 'varchar', length: 24, nullable: true })
  intent: string | null;

  /** 0 — мусор (одно слово, медиа-заглушка), 1 — обычный, 2 — показательный. */
  @Column({ type: 'smallint', default: 1 })
  quality: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
