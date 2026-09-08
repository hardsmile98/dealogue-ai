export { baseApi } from './baseApi'
export { setAuthTokenProvider } from './authToken'
export { runMock, MockApiError } from './mock/runMock'
export type { MockResult } from './mock/runMock'
export { telegramMockDb } from './mock/telegram/db'
export type {
  AccountStatsDto,
  AccountStatsQuery,
  ChatDto,
  ChatPeerDto,
  ChatsQuery,
  CodeStatsDto,
  DailyStatsDto,
  MessageDirection,
  MessageDto,
  SendCodeRequest,
  SendCodeResponse,
  SignInRequest,
  SignInResponse,
  StatsTotalsDto,
  SubmitPasswordRequest,
  SubmitPasswordResponse,
  TelegramAccountDto,
  TelegramAccountStatus,
} from './contracts/telegram'
