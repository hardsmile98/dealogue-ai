import type { WithSessionState } from './types'

export const selectSession = (state: WithSessionState) => state.session.current

export const selectCurrentUser = (state: WithSessionState) =>
  state.session.current?.user ?? null

export const selectAccessToken = (state: WithSessionState) =>
  state.session.current?.accessToken ?? null

export const selectIsAuthenticated = (state: WithSessionState) =>
  state.session.current !== null
