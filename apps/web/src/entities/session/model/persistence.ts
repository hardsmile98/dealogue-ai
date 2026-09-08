import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit'
import { clearStoredSession, writeStoredSession } from '../lib/sessionStorage'
import { sessionCleared, sessionEstablished } from './slice'

const listener = createListenerMiddleware()

listener.startListening({
  matcher: isAnyOf(sessionEstablished, sessionCleared),
  effect: (action) => {
    if (sessionEstablished.match(action)) {
      writeStoredSession(action.payload.session, action.payload.remember)
      return
    }
    clearStoredSession()
  },
})

/**
 * Синхронизирует сессию с браузерным хранилищем, чтобы компонентам
 * не приходилось помнить про localStorage при логине и логауте.
 */
export const sessionPersistenceMiddleware = listener.middleware
