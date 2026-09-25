import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ClientFactKind =
  | 'situation'
  | 'emotion'
  | 'objection'
  | 'biography'
  | 'preference'
  | 'expectation';

export type ClientFactStatus = 'active' | 'superseded';

/**
 * Свободные факты о клиенте, которые не помещаются в карточку: «муж ушёл
 * три месяца назад», «боится, что дорого». Пишет анализатор; при
 * противоречии старый факт помечается superseded и ссылается на новый.
 */
@Entity({ name: 'bot_client_facts' })
@Index(['chatId', 'status', 'createdAt'])
export class BotClientFactEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'chat_id', type: 'uuid' })
  chatId: string;

  @Column({ type: 'varchar', length: 16 })
  kind: ClientFactKind;

  @Column({ type: 'text' })
  text: string;

  /** telegram_message_id сообщения клиента, из которого факт взят. */
  @Column({ name: 'source_message_id', type: 'integer', nullable: true })
  sourceMessageId: number | null;

  @Column({ type: 'real', default: 1 })
  confidence: number;

  @Column({ type: 'varchar', length: 12, default: 'active' })
  status: ClientFactStatus;

  @Column({ name: 'superseded_by', type: 'uuid', nullable: true })
  supersededBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
