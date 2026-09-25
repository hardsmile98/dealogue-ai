/**
 * Запас перед формальным exp: сеть и часы клиента расходятся, и запрос,
 * отправленный «в последнюю секунду», всё равно вернул бы 401.
 */
export const EXPIRY_SKEW_MS = 5_000;

interface JwtPayload {
  exp?: number;
}

function decodeBase64Url(value: string): string | null {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    // atob отдаёт байты как latin1 — возвращаем их в UTF-8, иначе
    // кириллица в payload ломает JSON.parse.
    return decodeURIComponent(
      binary
        .split('')
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );
  } catch {
    return null;
  }
}

/**
 * Момент истечения токена в мс или null, если это не JWT либо в нём нет exp
 * (например, токен мок-логина). Подпись не проверяем — это забота сервера,
 * нам нужен только срок, чтобы не ходить в API с заведомо мёртвым токеном.
 */
export function getTokenExpiresAt(token: string): number | null {
  const payloadPart = token.split('.')[1];
  if (!payloadPart) return null;

  const json = decodeBase64Url(payloadPart);
  if (json === null) return null;

  try {
    const payload = JSON.parse(json) as JwtPayload;
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Токен без exp считаем бессрочным: решать будет сервер своим 401. */
export function isTokenExpired(token: string): boolean {
  const expiresAt = getTokenExpiresAt(token);
  return expiresAt !== null && expiresAt - EXPIRY_SKEW_MS <= Date.now();
}
