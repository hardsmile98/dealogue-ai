import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import teleproto from 'teleproto';

const { errors } = teleproto;

/** Сессия больше не действует — аккаунт нужно переподключать заново. */
export function isAuthLost(error: unknown): boolean {
  return (
    error instanceof errors.AuthKeyUnregisteredError ||
    error instanceof errors.SessionRevokedError ||
    error instanceof errors.UserDeactivatedError ||
    error instanceof errors.AuthKeyDuplicatedError ||
    (error instanceof errors.RPCError &&
      /AUTH_KEY_UNREGISTERED|SESSION_REVOKED|USER_DEACTIVATED|SESSION_EXPIRED|AUTH_KEY_INVALID/.test(
        error.errorMessage ?? '',
      ))
  );
}

export function isFloodWait(error: unknown): error is { seconds: number } {
  return error instanceof errors.FloodWaitError;
}

export function floodWaitMessage(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Telegram временно ограничил запросы (FLOOD_WAIT, ${minutes} мин). Синхронизация возобновится автоматически.`;
}

/** Человекочитаемое описание для statusMessage аккаунта. */
export function describeError(error: unknown): string {
  if (isFloodWait(error)) return floodWaitMessage(error.seconds);
  if (isAuthLost(error)) {
    return 'Сессия завершена на стороне Telegram. Переподключите аккаунт, чтобы продолжить отслеживание.';
  }
  if (error instanceof errors.RPCError) {
    return `Ошибка Telegram: ${error.errorMessage}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Переводит ошибки teleproto в HTTP-исключения NestJS с текстом, который
 * можно показать пользователю. Всё, что не распознано, — 502.
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
    return new BadRequestException('Попытка входа устарела — начните заново');
  }
  if (error instanceof errors.RPCError) {
    return new HttpException(`Ошибка Telegram: ${error.errorMessage}`, HttpStatus.BAD_GATEWAY);
  }
  if (error instanceof TelegramUnavailableError) {
    return new ServiceUnavailableException(error.message);
  }
  return new HttpException(
    error instanceof Error ? error.message : 'Не удалось выполнить запрос к Telegram',
    HttpStatus.BAD_GATEWAY,
  );
}

/** Ни через один MTProxy подключиться не удалось. */
export class TelegramUnavailableError extends Error {
  constructor(message = 'Не удалось подключиться к Telegram. Проверьте MTProxy') {
    super(message);
    this.name = 'TelegramUnavailableError';
  }
}
