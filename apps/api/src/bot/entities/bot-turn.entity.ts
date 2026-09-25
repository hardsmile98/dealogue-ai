import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** `restore` — память по уже идущей переписке (чат, скопированный в песочницу), без отправки. */
export type BotTurnTrigger = 'client' | 'schedule' | 'restore';
/**
 * `done` — ход без отправки, который выполнил свою работу (восстановление
 * памяти); `interrupted` — API остановился раньше, чем текст был собран:
 * ничего не ушло, ход повторён заново и ключ идемпотентности не держит.
 */
export type BotTurnStatus =
  | 'running'
  | 'sent'
  | 'handoff'
  | 'skipped'
  | 'failed'
  | 'done'
  | 'interrupted';

/**
 * Журнал ходов: отвечает на «почему агент так сказал». Вход, анализ, план,
 * черновик, замечания проверяющего, итог жёстких проверок, что и с какой
 * задержкой ушло. Ключ идемпотентности пишется до первой отправки: второй
 * ход с тем же ключом не начнётся. Прерванный до фиксации ход
 * (`interrupted`) ключ отпускает — его повтор должен пройти.
 */
@Entity({ name: 'bot_turns' })
@Index(['chatId', 'startedAt'])
@Index('UQ_bot_turns_idempotency_key_active', ['idempotencyKey'], {
  unique: true,
  where: "status <> 'interrupted'",
})
export class BotTurnEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'chat_id', type: 'uuid' })
  chatId: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ type: 'varchar', length: 16 })
  trigger: BotTurnTrigger;

  /** `chat_id:generation_seq` для хода клиента, `job:<id>` для хода по расписанию. */
  @Column({ name: 'idempotency_key', type: 'varchar', length: 80 })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 16, default: 'running' })
  status: BotTurnStatus;

  /** Сообщения хода или задание планировщика. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  input: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  analysis: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  plan: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  draft: string | null;

  /** Замечания проверяющего и вторая версия. */
  @Column({ type: 'jsonb', nullable: true })
  review: Record<string, unknown> | null;

  /** Итог жёстких проверок: части к отправке и что отрезано. */
  @Column({ type: 'jsonb', nullable: true })
  final: Record<string, unknown> | null;

  /** Что ушло: текст, задержка, telegram_message_id. */
  @Column({ type: 'jsonb', nullable: true })
  sent: Record<string, unknown> | null;

  /**
   * Точка фиксации: собранный текст и план задержек (core/resume.ts →
   * DeliveryRecord). Есть — ход после остановки API досылается, нет —
   * повторяется целиком.
   */
  @Column({ type: 'jsonb', nullable: true })
  delivery: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date | null;
}
