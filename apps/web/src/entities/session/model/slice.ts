import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { readStoredSession } from '../lib/sessionStorage'
import type { Session, SessionState } from './types'

export const SESSION_SLICE_NAME = 'session'

export interface SessionEstablishedPayload {
  session: Session
  /** true → localStorage, false → sessionStorage. Обрабатывается в persistence.ts. */
  remember: boolean
}

const initialState: SessionState = {
  current: readStoredSession(),
}

export const sessionSlice = createSlice({
  name: SESSION_SLICE_NAME,
  initialState,
  reducers: {
    sessionEstablished(
      state,
      action: PayloadAction<SessionEstablishedPayload>,
    ) {
      state.current = action.payload.session
    },
    sessionCleared(state) {
      state.current = null
    },
  },
})

export const { sessionEstablished, sessionCleared } = sessionSlice.actions
export const sessionReducer = sessionSlice.reducer
