import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import teleproto from 'teleproto';
import type { Api, TelegramClient } from 'teleproto';
import { runDetached } from '../../common/async.js';
import {
  TelegramClientFactory,
  safeDestroy,
} from '../client/telegram-client.factory.js';
import { TelegramLoginAttemptEntity } from '../entities/telegram-login-attempt.entity.js';
import { normalizePhone } from '../lib/phone.js';
import { SessionCrypto } from '../lib/session-crypto.js';
import { isAuthLost, toHttpException } from '../lib/telegram-errors.js';
import { displayNameOf } from '../lib/telegram-objects.js';
import { TelegramAccountsRepository } from '../repositories/telegram-accounts.repository.js';
import { TelegramRuntimeService } from '../runtime/telegram-runtime.service.js';
import { TelegramConfig } from '../telegram.config.js';
import { toAccountDto } from '../telegram.types.js';
import type {
  SendCodeResponse,
  SignInResponse,
  SubmitPasswordResponse,
  TelegramAccountDto,
} from '../telegram.types.js';

const { Api: Tl, errors, password: passwordLib } = teleproto;

const CLEANUP_INTERVAL_MS = 60_000;

interface LiveAttempt {
  client: TelegramClient;
  userId: string;
  phone: string;
  expiresAt: number;
}

/**
 * Вход в аккаунт пользователя Telegram в три шага: номер → код → облачный
 * пароль (если включена 2FA). Между шагами клиент держится в памяти, а его
 * сессия — в базе, так что шаг переживёт перезапуск API. На одну пару
 * пользователь + номер живёт одна попытка: новая закрывает прежнюю.
 */
@Injectable()
export class TelegramAuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramAuthService.name);
  private readonly liveAttempts = new Map<string, LiveAttempt>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: TelegramConfig,
    private readonly factory: TelegramClientFactory,
    private readonly crypto: SessionCrypto,
    private readonly runtime: TelegramRuntimeService,
    private readonly accounts: TelegramAccountsRepository,
    @InjectRepository(TelegramLoginAttemptEntity)
    private readonly attempts: Repository<TelegramLoginAttemptEntity>,
  ) {}

  onModuleInit(): void {
    if (!this.config.enabled) return;
    this.cleanupTimer = setInterval(() => {
      runDetached(this.cleanup(), this.logger, 'Уборка попыток входа');
    }, CLEANUP_INTERVAL_MS);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    await Promise.all(
      [...this.liveAttempts.values()].map((a) => safeDestroy(a.client)),
    );
    this.liveAttempts.clear();
  }

  async sendCode(userId: string, rawPhone: string): Promise<SendCodeResponse> {
    const phone = normalizePhone(rawPhone);

    const existing = await this.accounts.findByPhone(userId, phone);
    if (existing?.status === 'connected' && this.runtime.isLive(existing.id)) {
      throw new ConflictException(`Номер ${phone} уже подключён`);
    }
    // Код запросили заново — прежняя попытка больше не нужна, её клиент закрываем.
    await this.dropAttemptsFor(userId, phone);

    const { client } = await this.factory
      .connect('')
      .catch((error: unknown) => {
        throw loginError(error);
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
      this.liveAttempts.set(attempt.id, {
        client,
        userId,
        phone,
        expiresAt: attempt.expiresAt.getTime(),
      });
      this.logger.log(
        `Код отправлен на ${phone} (${sent.isCodeViaApp ? 'в приложение' : 'по SMS'})`,
      );
      return { attemptId: attempt.id, phone };
    } catch (error) {
      await safeDestroy(client);
      throw loginError(error);
    }
  }

  async signIn(
    userId: string,
    attemptId: string,
    code: string,
  ): Promise<SignInResponse> {
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
      return {
        status: 'connected',
        account: await this.finish(attempt, client, result),
      };
    } catch (error) {
      if (error instanceof errors.SessionPasswordNeededError) {
        await this.attempts.update(attempt.id, { codeVerified: true });
        return { status: 'password_required', account: null };
      }
      throw loginError(error);
    }
  }

  async submitPassword(
    userId: string,
    attemptId: string,
    password: string,
  ): Promise<SubmitPasswordResponse> {
    const attempt = await this.loadAttempt(userId, attemptId);
    if (!attempt.codeVerified) {
      throw new BadRequestException('Сначала подтвердите код из Telegram');
    }
    const client = await this.clientFor(attempt);

    try {
      const current = await client.invoke(new Tl.account.GetPassword());
      const srp = await passwordLib.computeCheck(current, password);
      const result = await client.invoke(
        new Tl.auth.CheckPassword({ password: srp }),
      );
      return {
        status: 'connected',
        account: await this.finish(attempt, client, result),
      };
    } catch (error) {
      throw loginError(error);
    }
  }

  // --- внутреннее -----------------------------------------------------------

  private async loadAttempt(
    userId: string,
    attemptId: string,
  ): Promise<TelegramLoginAttemptEntity> {
    const attempt = await this.attempts.findOne({
      where: { id: attemptId, userId },
    });
    if (!attempt || attempt.expiresAt.getTime() < Date.now()) {
      if (attempt) await this.dropAttempt(attempt.id);
      throw new NotFoundException('Попытка входа устарела — начните заново');
    }
    return attempt;
  }

  private async clientFor(
    attempt: TelegramLoginAttemptEntity,
  ): Promise<TelegramClient> {
    const live = this.liveAttempts.get(attempt.id);
    if (live && live.client.connected) return live.client;
    if (live) await safeDestroy(live.client);

    const { client } = await this.factory
      .connect(this.crypto.decrypt(attempt.sessionEncrypted))
      .catch((error: unknown) => {
        throw loginError(error);
      });
    this.liveAttempts.set(attempt.id, {
      client,
      userId: attempt.userId,
      phone: attempt.phone,
      expiresAt: attempt.expiresAt.getTime(),
    });
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

    const account =
      (await this.accounts.findByPhone(attempt.userId, attempt.phone)) ??
      this.accounts.create({
        userId: attempt.userId,
        phone: attempt.phone,
        historySynced: false,
      });
    account.telegramUserId = me.id.toString();
    account.username = me.username ?? null;
    account.displayName = displayNameOf(me);
    account.status = 'connected';
    account.statusMessage = null;
    account.sessionEncrypted = this.crypto.encrypt(saveSession(client));
    account.connectedAt = new Date();
    const saved = await this.accounts.save(account);

    await this.runtime.attach(saved, client);
    this.logger.log(`Аккаунт ${saved.phone} (${saved.displayName}) подключён`);
    return toAccountDto(saved, 0);
  }

  private async dropAttempt(attemptId: string): Promise<void> {
    const live = this.liveAttempts.get(attemptId);
    if (live) {
      this.liveAttempts.delete(attemptId);
      await safeDestroy(live.client);
    }
    await this.attempts.delete(attemptId);
  }

  private async dropAttemptsFor(userId: string, phone: string): Promise<void> {
    const clients: TelegramClient[] = [];
    for (const [id, live] of this.liveAttempts) {
      if (live.userId === userId && live.phone === phone) {
        this.liveAttempts.delete(id);
        clients.push(live.client);
      }
    }
    await Promise.all(clients.map((client) => safeDestroy(client)));
    await this.attempts.delete({ userId, phone });
  }

  /** Раз в минуту: закрыть клиентов просроченных попыток и подчистить строки. */
  private async cleanup(): Promise<void> {
    const now = Date.now();
    const expired: TelegramClient[] = [];
    for (const [id, live] of this.liveAttempts) {
      if (live.expiresAt < now) {
        this.liveAttempts.delete(id);
        expired.push(live.client);
      }
    }
    await Promise.all(expired.map((client) => safeDestroy(client)));
    await this.attempts.delete({ expiresAt: LessThan(new Date(now)) });
  }
}

/**
 * Ошибки шагов входа. Отзыв сессии здесь значит не «переподключите
 * аккаунт», а что сама попытка входа протухла на стороне Telegram.
 */
function loginError(error: unknown): HttpException {
  if (isAuthLost(error)) {
    return new BadRequestException('Попытка входа устарела — начните заново');
  }
  return toHttpException(error);
}

function saveSession(client: TelegramClient): string {
  return String(client.session.save());
}
