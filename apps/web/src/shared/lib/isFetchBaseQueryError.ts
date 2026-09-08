import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'

/** Отличает ошибку запроса RTK Query от SerializedError, брошенной в queryFn. */
export function isFetchBaseQueryError(
  error: unknown,
): error is FetchBaseQueryError {
  return typeof error === 'object' && error !== null && 'status' in error
}
