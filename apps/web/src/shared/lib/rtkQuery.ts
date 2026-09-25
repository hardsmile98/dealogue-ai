import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

/** Отличает ошибку запроса RTK Query от SerializedError, брошенной в queryFn. */
export function isFetchBaseQueryError(
  error: unknown,
): error is FetchBaseQueryError {
  return typeof error === 'object' && error !== null && 'status' in error;
}

/** Что возвращает вызов мутации RTK Query: либо данные, либо ошибку. */
type MutationResult<T> = { data: T } | { error: unknown };

/**
 * Мутация прошла — можно закрывать диалог или чистить форму.
 *
 * Триггер мутации не бросает исключение: ошибка приходит полем `error`.
 * Проверка вынесена сюда, чтобы по коду не расползались `!('error' in result)`.
 */
export function isMutationSuccess<T>(
  result: MutationResult<T>,
): result is { data: T } {
  return !('error' in result);
}
