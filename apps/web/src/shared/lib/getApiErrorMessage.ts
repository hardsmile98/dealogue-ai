import { isFetchBaseQueryError } from './isFetchBaseQueryError'

interface ErrorBody {
  message?: string | string[]
}

/**
 * Достаёт человекочитаемое сообщение из ошибки RTK Query.
 * NestJS кладёт текст в `data.message` (строкой или массивом при валидации).
 */
export function getApiErrorMessage(
  error: unknown,
  fallback = 'Что-то пошло не так. Попробуйте ещё раз.',
): string {
  if (!isFetchBaseQueryError(error)) return fallback

  if (error.status === 'FETCH_ERROR') {
    return 'Сервер недоступен. Проверьте соединение.'
  }

  const body = error.data as ErrorBody | undefined
  const message = body?.message
  if (Array.isArray(message)) return message.join(', ')
  if (typeof message === 'string' && message.trim()) return message
  return fallback
}
