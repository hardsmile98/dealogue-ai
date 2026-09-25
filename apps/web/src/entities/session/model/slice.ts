import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { unauthorized } from '@/shared/api';
import { readStoredSession } from '../lib/sessionStorage';
import type { Session, SessionState } from './types';

export const SESSION_SLICE_NAME = 'session';

export interface SessionEstablishedPayload {
  session: Session;
  /** true → localStorage, false → sessionStorage. Обрабатывается в lifecycle.ts. */
  remember: boolean;
}

const stored = readStoredSession();

const initialState: SessionState = {
  current: stored.session,
  expired: stored.expired,
};

export const sessionSlice = createSlice({
  name: SESSION_SLICE_NAME,
  initialState,
  reducers: {
    sessionEstablished(
      state,
      action: PayloadAction<SessionEstablishedPayload>,
    ) {
      state.current = action.payload.session;
      state.expired = false;
    },
    sessionCleared(state) {
      state.current = null;
      // Осознанный выход — не повод показывать «сессия истекла».
      state.expired = false;
    },
  },
  extraReducers: (builder) => {
    // 401 с живым токеном: сервер нас больше не знает — выходим сами,
    // иначе пользователь остаётся в интерфейсе, где ничего не грузится.
    builder.addCase(unauthorized, (state) => {
      state.current = null;
      state.expired = true;
    });
  },
});

export const { sessionEstablished, sessionCleared } = sessionSlice.actions;
export const sessionReducer = sessionSlice.reducer;
