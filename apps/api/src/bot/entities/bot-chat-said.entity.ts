import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Что агент уже сделал в чате: `milestone` — доставленная веха (по ним
 * вычисляется этап), `nudge` — заданное подталкивание, `argument` —
 * использованный подход из плейбука, `link` — отправленная ссылка.
 */
export type ChatSaidKind = 'milestone' | 'nudge' | 'argument' | 'link';

/** Реестр сказанного — чтобы не повторяться и знать этап. Пишет код по итогу хода. */
@Entity({ name: 'bot_chat_said' })
@Index(['chatId', 'kind', 'at'])
export class BotChatSaidEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'chat_id', type: 'uuid' })
  chatId: string;

  @Column({ type: 'varchar', length: 16 })
  kind: ChatSaidKind;

  /** Ключ вехи, подталкивания или аргумента. */
  @Column({ type: 'varchar', length: 64 })
  key: string;

  /** telegram_message_id нашего сообщения, которым это сказано. */
  @Column({ name: 'message_id', type: 'integer', nullable: true })
  messageId: number | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  at: Date;
}
