import { configureStore } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'
import { baseApi, setAuthTokenProvider } from '@/shared/api'
import {
  SESSION_SLICE_NAME,
  selectAccessToken,
  sessionPersistenceMiddleware,
  sessionReducer,
} from '@/entities/session'

export const store = configureStore({
  reducer: {
    [SESSION_SLICE_NAME]: sessionReducer,
    [baseApi.reducerPath]: baseApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
      .prepend(sessionPersistenceMiddleware)
      .concat(baseApi.middleware),
})

// refetchOnFocus / refetchOnReconnect для RTK Query.
setupListeners(store.dispatch)

// Отдаём shared/api доступ к токену, не импортируя store снизу вверх.
setAuthTokenProvider(() => selectAccessToken(store.getState()))

export type AppStore = typeof store
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
