import { isFetchBaseQueryError } from '@/shared/lib'

const INVALID_CREDENTIALS = 'Неверный логин или пароль'
const FALLBACK = 'Не удалось войти. Попробуйте ещё раз.'

/** Превращает ошибку RTK Query в текст, который не стыдно показать пользователю. */
export function getLoginErrorMessage(error: unknown): string {
  if (!isFetchBaseQueryError(error)) {
    return FALLBACK
  }

  if (error.status === 400 || error.status === 401) {
    return INVALID_CREDENTIALS
  }

  if (error.status === 'FETCH_ERROR') {
    return 'Сервер недоступен. Проверьте подключение и попробуйте снова.'
  }

  if (error.status === 'PARSING_ERROR') {
    return 'Сервер вернул неожиданный ответ. Попробуйте позже.'
  }

  if (typeof error.status === 'number') {
    return `Ошибка сервера (${error.status}). Попробуйте позже.`
  }

  return FALLBACK
}
