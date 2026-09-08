import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import teleproto from 'teleproto';
import type { Api, TelegramClient } from 'teleproto';
import { TelegramClientFactory, safeDestroy } from '../client/telegram-client.factory.js';
import { TelegramAccountEntity } from '../entities/telegram-account.entity.js';
import { TelegramLoginAttemptEntity } from '../entities/telegram-login-attempt.entity.js';
import { normalizePhone } from '../lib/phone.js';
import { SessionCrypto } from '../lib/session-crypto.js';
import { toHttpException } from '../lib/telegram-errors.js';
import { TelegramConfig } from '../telegram.config.js';
import { toAccountDto } from '../telegram.types.js';
import type {
  SendCodeResponse,
  SignInResponse,
  SubmitPasswordResponse,
  TelegramAccountDto,
} from '../telegram.types.js';
import { displayNameOf } from './telegram-ingest.service.js';
import { TelegramRuntimeService } from './telegram-runtime.service.js';

const { Api: Tl, errors, password: passwordLib } = teleproto;

const CLEANUP_INTERVAL_MS = 60_000;

interface LiveAttempt {
  client: TelegramClient;
  expiresAt: number;
}

/**
 * Вход в аккаунт пользователя Telegram в три шага: номер → код → облачный
 * пароль (если включена 2FA). Между шагами клиент держится в памяти, а его
 * сессия — в базе, так что шаг переживёт перезапуск API.
 */
@Injectable()
export class TelegramAuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramAuthService.name);
  private readonly liveAttempts = new Map<string, LiveAttempt>();
  private readonly crypto: SessionCrypto;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: TelegramConfig,
    private readonly factory: TelegramClientFactory,
    private readonly runtime: TelegramRuntimeService,
    @InjectRepository(TelegramLoginAttemptEntity)
    private readonly attempts: Repository<TelegramLoginAttemptEntity>,
    @InjectRepository(TelegramAccountEntity)
    private readonly accounts: Repository<TelegramAccountEntity>,
  ) {
    this.crypto = new SessionCrypto(config.sessionSecret || 'telegram-disabled');
  }

  onModuleInit(): void {
    this.cleanupTimer = setInterval(() => void this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    await Promise.all([...this.liveAttempts.values()].map((a) => safeDestroy(a.client)));
    this.liveAttempts.clear();
  }

  async sendCode(userId: string, rawPhone: string): Promise<SendCodeResponse> {
    this.ensureEnabled();
    const phone = normalizePhone(rawPhone);

    const existing = await this.accounts.findOne({ where: { userId, phone } });
    if (existing?.status === 'connected' && this.runtime.isLive(existing.id)) {
      throw new ConflictException(`Номер ${phone} уже подключён`);
    }

    const { client } = await this.factory.connect('').catch((error) => {
      throw toHttpException(error);
    });

    try {
      const sent = await client.sendCode(this.factory.credentials, phone);
      const attempt = await this.attempts.save(
        this.attempts.create({
          userId,
          phone,
          phoneCodeHash: sent.phoneCodeHash,
          sessionEncrypted: this.crypto.encrypt(saveSession(client)),
          codeVerified: false,
          expiresAt: new Date(Date.now() + this.config.loginAttemptTtlMs),
        }),
      );
      this.liveAttempts.set(attempt.id, { client, expiresAt: attempt.expiresAt.getTime() });
      this.logger.log(`Код отправлен на ${phone} (${sent.isCodeViaApp ? 'в приложение' : 'по SMS'})`);
      return { attemptId: attempt.id, phone };
    } catch (error) {
      await safeDestroy(client);
      throw toHttpException(error);
    }
  }

  async signIn(userId: string, attemptId: string, code: string): Promise<SignInResponse> {
    this.ensureEnabled();
    const attempt = await this.loadAttempt(userId, attemptId);
    const client = await this.clientFor(attempt);

    try {
      const result = await client.invoke(
        new Tl.auth.SignIn({
          phoneNumber: attempt.phone,
          phoneCodeHash: attempt.phoneCodeHash,
          phoneCode: code,
        }),
      );
      return { status: 'connected', account: await this.finish(attempt, client, result) };
    } catch (error) {
      if (error instanceof errors.SessionPasswordNeededError) {
        attempt.codeVerified = true;
        await this.attempts.save(attempt);
        return { status: 'password_required', account: null };
      }
      throw toHttpException(error);
    }
  }

  async submitPassword(
    userId: string,
    attemptId: string,
    password: string,
  ): Promise<SubmitPasswordResponse> {
    this.ensureEnabled();
    const attempt = await this.loadAttempt(userId, attemptId);
    if (!attempt.codeVerified) {
      throw new BadRequestException('Сначала подтвердите код из Telegram');
    }
    const client = await this.clientFor(attempt);

    try {
      const current = await client.invoke(new Tl.account.GetPassword());
      const srp = await passwordLib.computeCheck(current, password);
      const result = await client.invoke(new Tl.auth.CheckPassword({ password: srp }));
      return { status: 'connected', account: await this.finish(attempt, client, result) };
    } catch (error) {
      throw toHttpException(error);
    }
  }

  // --- внутреннее -----------------------------------------------------------

  private ensureEnabled(): void {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException(
        'Раздел Telegram не настроен: задайте TELEGRAM_API_ID и TELEGRAM_API_HASH',
      );
    }
  }

  private async loadAttempt(userId: string, attemptId: string): Promise<TelegramLoginAttemptEntity> {
    const attempt = await this.attempts.findOne({ where: { id: attemptId, userId } });
    if (!attempt || attempt.expiresAt.getTime() < Date.now()) {
      if (attempt) await this.dropAttempt(attempt.id);
      throw new NotFoundException('Попытка входа устарела — начните заново');
    }
    return attempt;
  }

  private async clientFor(attempt: TelegramLoginAttemptEntity): Promise<TelegramClient> {
    const live = this.liveAttempts.get(attempt.id);
    if (live && live.client.connected) return live.client;
    if (live) await safeDestroy(live.client);

    const { client } = await this.factory
      .connect(this.crypto.decrypt(attempt.sessionEncrypted))
      .catch((error) => {
        throw toHttpException(error);
      });
    this.liveAttempts.set(attempt.id, { client, expiresAt: attempt.expiresAt.getTime() });
    return client;
  }

  private async finish(
    attempt: TelegramLoginAttemptEntity,
    client: TelegramClient,
    authorization: Api.auth.TypeAuthorization,
  ): Promise<TelegramAccountDto> {
    if (authorization.className !== 'auth.Authorization') {
      throw new BadRequestException('Этот номер не зарегистрирован в Telegram');
    }

    this.liveAttempts.delete(attempt.id);
    await this.attempts.delete(attempt.id);

    const me =
      authorization.user.className === 'User'
        ? (authorization.user as Api.User)
        : await client.getMe();

    let account = await this.accounts.findOne({
      where: { userId: attempt.userId, phone: attempt.phone },
    });
    if (!account) {
      account = this.accounts.create({
        userId: attempt.userId,
        phone: attempt.phone,
        historySynced: false,
      });
    }
    account.telegramUserId = me.id.toString();
    account.username = me.username ?? null;
    account.displayName = displayNameOf(me);
    account.status = 'connected';
    account.statusMessage = null;
    account.sessionEncrypted = this.crypto.encrypt(saveSession(client));
    account.connectedAt = new Date();
    account = await this.accounts.save(account);

    await this.runtime.attach(account, client);
    this.logger.log(`Аккаунт ${account.phone} (${account.displayName}) подключён`);
    return toAccountDto(account, 0);
  }

  private async dropAttempt(attemptId: string): Promise<void> {
    const live = this.liveAttempts.get(attemptId);
    if (live) {
      this.liveAttempts.delete(attemptId);
      await safeDestroy(live.client);
    }
    await this.attempts.delete(attemptId);
  }

  /** Раз в минуту: закрыть клиентов просроченных попыток и подчистить строки. */
  private async cleanup(): Promise<void> {
    const now = Date.now();
    for (const [id, live] of this.liveAttempts) {
      if (live.expiresAt < now) {
        this.liveAttempts.delete(id);
        await safeDestroy(live.client);
      }
    }
    await this.attempts.delete({ expiresAt: LessThan(new Date(now)) });
  }
}

function saveSession(client: TelegramClient): string {
  return String(client.session.save());
}
