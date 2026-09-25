import { HttpException, HttpStatus } from '@nestjs/common';
import teleproto from 'teleproto';
import { describe, expect, it } from 'vitest';
import { TimeoutError } from '../../common/async.js';
import {
  AUTH_LOST_MESSAGE,
  AccountOfflineError,
  PeerUnresolvedError,
  describeError,
  isAuthLost,
  toHttpException,
} from './telegram-errors.js';

const { errors } = teleproto;

function rpc(message: string, code = 400): Error {
  return new errors.RPCError(message, undefined as never, code);
}

function mapped(error: unknown): { status: number; message: unknown } {
  const exception = toHttpException(error);
  const body = exception.getResponse() as { message?: unknown } | string;
  return {
    status: exception.getStatus(),
    message: typeof body === 'string' ? body : body.message,
  };
}

describe('toHttpException', () => {
  it('HttpException пропускает как есть', () => {
    const original = new HttpException('как есть', HttpStatus.I_AM_A_TEAPOT);
    expect(toHttpException(original)).toBe(original);
  });

  it('отказы при отправке переводит в понятные статусы', () => {
    expect(mapped(rpc('USER_IS_BLOCKED'))).toEqual({
      status: HttpStatus.FORBIDDEN,
      message: 'Собеседник заблокировал этот аккаунт',
    });
    expect(mapped(rpc('INPUT_USER_DEACTIVATED')).status).toBe(HttpStatus.GONE);
    expect(mapped(rpc('PEER_ID_INVALID')).status).toBe(HttpStatus.CONFLICT);
  });

  it('незнакомая ошибка Telegram — 502 с её кодом', () => {
    expect(mapped(rpc('SOMETHING_NEW'))).toEqual({
      status: HttpStatus.BAD_GATEWAY,
      message: 'Ошибка Telegram: SOMETHING_NEW',
    });
  });

  it('состояние аккаунта и таймауты — не 500', () => {
    expect(mapped(new AccountOfflineError('id'))).toEqual({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      message: 'Аккаунт не подключён к Telegram',
    });
    expect(mapped(new PeerUnresolvedError('1')).status).toBe(
      HttpStatus.CONFLICT,
    );
    expect(mapped(new TimeoutError(10)).status).toBe(
      HttpStatus.GATEWAY_TIMEOUT,
    );
    expect(mapped(rpc('AUTH_KEY_UNREGISTERED', 401))).toEqual({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      message: AUTH_LOST_MESSAGE,
    });
  });
});

describe('isAuthLost / describeError', () => {
  it('узнаёт отзыв сессии и по тексту RPC-ошибки', () => {
    expect(isAuthLost(rpc('SESSION_EXPIRED', 401))).toBe(true);
    expect(isAuthLost(rpc('USER_DEACTIVATED_BAN', 401))).toBe(true);
    expect(isAuthLost(rpc('USER_IS_BLOCKED'))).toBe(false);
  });

  it('удалённый аккаунт собеседника — не потеря нашей сессии', () => {
    expect(isAuthLost(rpc('INPUT_USER_DEACTIVATED'))).toBe(false);
    expect(isAuthLost(new Error('AUTH_KEY_UNREGISTERED'))).toBe(false);
  });

  it('описывает ошибку одной строкой', () => {
    expect(describeError(rpc('USER_IS_BLOCKED'))).toBe(
      'Ошибка Telegram: USER_IS_BLOCKED',
    );
    expect(describeError(new Error('сеть'))).toBe('сеть');
    expect(describeError('строка')).toBe('строка');
  });
});
