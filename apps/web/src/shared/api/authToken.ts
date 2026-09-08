type AuthTokenProvider = () => string | null

let provider: AuthTokenProvider = () => null

/**
 * Токен хранится в store (entities/session), но shared не имеет права
 * импортировать верхние слои. Поэтому app при сборке store прокидывает
 * getter сюда, а baseQuery только читает его.
 */
export function setAuthTokenProvider(next: AuthTokenProvider): void {
  provider = next
}

export function getAuthToken(): string | null {
  return provider()
}
