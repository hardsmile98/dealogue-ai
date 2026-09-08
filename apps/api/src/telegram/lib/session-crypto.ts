import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const VERSION = 'v1';

/**
 * Сессия Telegram равна полному доступу к аккаунту, поэтому в базе она
 * лежит только зашифрованной. Ключ — SHA-256 от TELEGRAM_SESSION_SECRET,
 * формат: `v1.<base64(iv | tag | ciphertext)>`.
 */
export class SessionCrypto {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = createHash('sha256').update(secret).digest();
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${VERSION}.${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
  }

  decrypt(payload: string): string {
    const [version, body] = payload.split('.');
    if (version !== VERSION || !body) {
      throw new Error('Неизвестный формат зашифрованной сессии');
    }
    const raw = Buffer.from(body, 'base64');
    const iv = raw.subarray(0, IV_LENGTH);
    const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = raw.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
