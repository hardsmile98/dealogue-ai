import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { ChatLabel, ChatMode, HandoffReason } from '../library/kinds.js';

/**
 * Состояние агента в чате. Строка появляется, когда агент впервые берёт
 * чат (или владелец руками выставил режим), и живёт, пока есть чат.
 * `chat_id` без внешнего ключа: в песочнице чат виртуальный (`sandbox`).
 * Этап не хранится — он вычисляется по доставленным вехам в bot_chat_said.
 */
@Entity({ name: 'bot_chat_state' })
@Index(['accountId', 'mode'])
export class BotChatStateEntity {
  @PrimaryColumn({ name: 'chat_id', type: 'uuid' })
  chatId: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ type: 'varchar', length: 8, default: 'auto' })
  mode: ChatMode;

  /** Карточка клиента: имя, пол, дата и место рождения, категория, язык, уверенность (library/… раздел 4). */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  card: Record<string, unknown>;

  /** Скользящее резюме диалога. */
  @Column({ type: 'text', default: '' })
  summary: string;

  @Column({ name: 'turns_without_nudge', type: 'integer', default: 0 })
  turnsWithoutNudge: number;

  @Column({ name: 'reminders_sent', type: 'integer', default: 0 })
  remindersSent: number;

  /** До какого входящего (telegram_message_id) ход обработан. */
  @Column({ name: 'last_handled_message_id', type: 'integer', default: 0 })
  lastHandledMessageId: number;

  /** Счётчик поколений генерации: результат со старым номером выбрасывается. */
  @Column({ name: 'generation_seq', type: 'integer', default: 0 })
  generationSeq: number;

  @Column({ name: 'handoff_reason', type: 'varchar', length: 32, nullable: true })
  handoffReason: HandoffReason | null;

  @Column({ name: 'handoff_at', type: 'timestamptz', nullable: true })
  handoffAt: Date | null;

  /** Ярлык в списке «у менеджера»; null — в списке не показывается. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  label: ChatLabel | null;

  @Column({ type: 'boolean', default: false })
  sandbox: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
