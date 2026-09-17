import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit'
import { baseApi, unauthorized } from '@/shared/api'
import { clearStoredSession, writeStoredSession } from '../lib/sessionStorage'
import { sessionCleared, sessionEstablished } from './slice'

const listener = createListenerMiddleware()

listener.startListening({
  matcher: isAnyOf(sessionEstablished, sessionCleared, unauthorized),
  effect: (action, api) => {
    if (sessionEstablished.match(action)) {
      writeStoredSession(action.payload.session, action.payload.remember)
      return
    }

    clearStoredSession()
    // Кеш RTK Query переживает разлогин: без сброса следующий вход увидел бы
    // чужие данные, а запросы с подписками продолжили бы биться о 401.
    api.dispatch(baseApi.util.resetApiState())
  },
})

/**
 * Побочные эффекты конца и начала сессии в одном месте: браузерное хранилище
 * и кеш API. Любой путь выхода — кнопка «Выйти» или 401 от сервера — приводит
 * к одинаковой уборке.
 */
export const sessionLifecycleMiddleware = listener.middleware
