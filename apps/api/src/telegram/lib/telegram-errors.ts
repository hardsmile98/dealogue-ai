import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import teleproto from 'teleproto';
import { TimeoutError } from '../../common/async.js';

const { errors } = teleproto;

export const AUTH_LOST_MESSAGE =
  'Сессия завершена на стороне Telegram. Переподключите аккаунт, чтобы продолжить отслеживание.';

/** Ни через один MTProxy подключиться не удалось. */
export class TelegramUnavailableError extends Error {
  constructor(message = 'Не удалось подключиться к Telegram. Проверьте MTProxy') {
    super(message);
    this.name = 'TelegramUnavailableError';
  }
}

/** Аккаунт не подключён — отправлять не через что. */
export class AccountOfflineError extends Error {
  constructor(accountId: string) {
    super(`Аккаунт ${accountId} не подключён к Telegram`);
    this.name = 'AccountOfflineError';
  }
}

/** Не удалось построить InputPeer собеседника (нет access hash и нет в свежих диалогах). */
export class PeerUnresolvedError extends Error {
  constructor(peerId: string) {
    super(`Не удалось определить собеседника ${peerId} для отправки`);
    this.name = 'PeerUnresolvedError';
  }
}

/**
 * Коды, после которых сессия аккаунта мертва. Сравниваются целиком: по
 * подстроке `USER_DEACTIVATED` совпал бы и `INPUT_USER_DEACTIVATED` — это
 * удалил аккаунт собеседник, а наша сессия жива.
 */
const AUTH_LOST_CODES = new Set([
  'AUTH_KEY_UNREGISTERED',
  'AUTH_KEY_INVALID',
  'SESSION_REVOKED',
  'SESSION_EXPIRED',
  'USER_DEACTIVATED',
  'USER_DEACTIVATED_BAN',
]);

/** Сессия больше не действует — аккаунт нужно переподключать заново. */
export function isAuthLost(error: unknown): boolean {
  return (
    error instanceof errors.AuthKeyUnregisteredError ||
    error instanceof errors.SessionRevokedError ||
    error instanceof errors.UserDeactivatedError ||
    error instanceof errors.AuthKeyDuplicatedError ||
    (error instanceof errors.RPCError &&
      AUTH_LOST_CODES.has(error.errorMessage ?? ''))
  );
}

export function isFloodWait(error: unknown): error is { seconds: number } {
  return error instanceof errors.FloodWaitError;
}

export function floodWaitMessage(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Telegram временно ограничил запросы (FLOOD_WAIT, ${minutes} мин). Синхронизация возобновится автоматически.`;
}

/** Человекочитаемое описание для statusMessage аккаунта и логов. */
export function describeError(error: unknown): string {
  if (isFloodWait(error)) return floodWaitMessage(error.seconds);
  if (isAuthLost(error)) return AUTH_LOST_MESSAGE;
  if (error instanceof errors.RPCError) {
    return `Ошибка Telegram: ${error.errorMessage}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Отказы Telegram при отправке сообщения, которые менеджер может понять и
 * исправить сам. Ключ — `errorMessage` RPC-ошибки.
 */
const SEND_REFUSALS: Record<string, () => HttpException> = {
  USER_IS_BLOCKED: () =>
    new ForbiddenException('Собеседник заблокировал этот аккаунт'),
  YOU_BLOCKED_USER: () =>
    new ForbiddenException('Собеседник в чёрном списке аккаунта — разблокируйте его в Telegram'),
  PRIVACY_PREMIUM_REQUIRED: () =>
    new ForbiddenException('Собеседник принимает сообщения только от Telegram Premium'),
  CHAT_WRITE_FORBIDDEN: () =>
    new ForbiddenException('Писать в этот чат нельзя'),
  INPUT_USER_DEACTIVATED: () =>
    new HttpException('Собеседник удалил аккаунт Telegram', HttpStatus.GONE),
  PEER_ID_INVALID: () =>
    new ConflictException('Telegram не узнаёт собеседника — дождитесь синхронизации и повторите'),
  MESSAGE_TOO_LONG: () =>
    new BadRequestException('Сообщение слишком длинное для Telegram'),
};

/**
 * Переводит ошибки teleproto и рантайма в HTTP-исключения NestJS с текстом,
 * который можно показать пользователю. Всё, что не распознано, — 502.
 */
export function toHttpException(error: unknown): HttpException {
  if (error instanceof HttpException) return error;

  if (isFloodWait(error)) {
    return new HttpException(floodWaitMessage(error.seconds), HttpStatus.TOO_MANY_REQUESTS);
  }
  if (error instanceof errors.PhoneNumberInvalidError) {
    return new BadRequestException('Telegram не принял номер. Проверьте формат: +7…');
  }
  if (error instanceof errors.PhoneNumberBannedError) {
    return new ForbiddenException('Этот номер заблокирован в Telegram');
  }
  if (error instanceof errors.PhoneNumberFloodError) {
    return new HttpException(
      'Слишком много попыток для этого номера. Попробуйте позже',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  if (error instanceof errors.PhoneCodeInvalidError) {
    return new BadRequestException('Неверный код. Проверьте сообщение от Telegram');
  }
  if (error instanceof errors.PhoneCodeExpiredError) {
    return new BadRequestException('Код устарел — запросите новый');
  }
  if (error instanceof errors.PasswordHashInvalidError) {
    return new BadRequestException('Неверный облачный пароль');
  }
  if (error instanceof errors.PhonePasswordFloodError) {
    return new HttpException(
      'Слишком много попыток ввода пароля. Попробуйте позже',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  if (isAuthLost(error)) {
    return new ServiceUnavailableException(AUTH_LOST_MESSAGE);
  }
  if (error instanceof errors.RPCError) {
    const refusal = SEND_REFUSALS[error.errorMessage ?? ''];
    if (refusal) return refusal();
    return new HttpException(`Ошибка Telegram: ${error.errorMessage}`, HttpStatus.BAD_GATEWAY);
  }
  if (error instanceof AccountOfflineError) {
    return new ServiceUnavailableException('Аккаунт не подключён к Telegram');
  }
  if (error instanceof PeerUnresolvedError) {
    return new ConflictException(
      'Не удалось найти собеседника в Telegram — дождитесь синхронизации и повторите',
    );
  }
  if (error instanceof TelegramUnavailableError) {
    return new ServiceUnavailableException(error.message);
  }
  if (error instanceof TimeoutError) {
    return new GatewayTimeoutException('Telegram не ответил вовремя, попробуйте ещё раз');
  }
  return new HttpException(
    error instanceof Error ? error.message : 'Не удалось выполнить запрос к Telegram',
    HttpStatus.BAD_GATEWAY,
  );
}
