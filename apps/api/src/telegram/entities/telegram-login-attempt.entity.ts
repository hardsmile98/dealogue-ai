import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Незавершённый вход: номер → код → (пароль). Сессия сохраняется уже после
 * sendCode, чтобы ввод кода пережил перезапуск API и мог уйти на любой
 * инстанс — клиент восстанавливается из сессии.
 */
@Entity({ name: 'telegram_login_attempts' })
export class TelegramLoginAttemptEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 32 })
  phone: string;

  @Column({ name: 'phone_code_hash', type: 'varchar', length: 128 })
  phoneCodeHash: string;

  @Column({ name: 'session_encrypted', type: 'text' })
  sessionEncrypted: string;

  @Column({ name: 'code_verified', type: 'boolean', default: false })
  codeVerified: boolean;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
