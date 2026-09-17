import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { unauthorized } from '@/shared/api'
import { EXPIRY_SKEW_MS, getTokenExpiresAt } from '../lib/jwt'
import { useSession } from './hooks'

/** Предел setTimeout (32-битный int): дальше таймер сработал бы сразу. */
const MAX_TIMEOUT_MS = 2_147_483_647

/**
 * Разлогинивает по часам, не дожидаясь первого 401: вкладка может простоять
 * открытой дольше жизни токена, и тогда пользователь тыкал бы в интерфейс,
 * где каждый запрос падает.
 */
export function useSessionExpiry(): void {
  const dispatch = useDispatch()
  const session = useSession()
  const token = session?.accessToken ?? null

  useEffect(() => {
    if (token === null) return

    const expiresAt = getTokenExpiresAt(token)
    // Токен без exp (мок-логин) — срок знает только сервер.
    if (expiresAt === null) return

    const delay = expiresAt - EXPIRY_SKEW_MS - Date.now()
    if (delay > MAX_TIMEOUT_MS) return

    const timer = setTimeout(() => dispatch(unauthorized()), Math.max(0, delay))
    return () => clearTimeout(timer)
  }, [token, dispatch])
}
