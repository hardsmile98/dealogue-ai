import { runMock, telegramMockDb } from '@/shared/api'
import type {
  SendCodeRequest,
  SendCodeResponse,
  SignInRequest,
  SignInResponse,
  SubmitPasswordRequest,
  SubmitPasswordResponse,
} from '@/shared/api'
import { IS_MOCK_TELEGRAM } from '@/shared/config'
import { TELEGRAM_ACCOUNT_TAG, accountsApi } from '@/entities/telegram-account'

const LIST_TAG = { type: TELEGRAM_ACCOUNT_TAG, id: 'LIST' } as const

/**
 * Трёхшаговый вход в Telegram-аккаунт (MTProto): номер → код → облачный
 * пароль, если включена 2FA. Инжектится в accountsApi, чтобы инвалидировать
 * список аккаунтов теми же тегами.
 */
export const connectApi = accountsApi.injectEndpoints({
  endpoints: (build) => ({
    sendCode: build.mutation<SendCodeResponse, SendCodeRequest>({
      queryFn: async ({ phone }, _api, _extra, baseQuery) => {
        if (IS_MOCK_TELEGRAM) return runMock(() => telegramMockDb.sendCode(phone), 600)
        const result = await baseQuery({
          url: '/telegram/accounts/send-code',
          method: 'POST',
          body: { phone },
        })
        return result.error ? { error: result.error } : { data: result.data as SendCodeResponse }
      },
    }),

    signIn: build.mutation<SignInResponse, SignInRequest>({
      queryFn: async ({ attemptId, code }, _api, _extra, baseQuery) => {
        if (IS_MOCK_TELEGRAM) return runMock(() => telegramMockDb.signIn(attemptId, code), 700)
        const result = await baseQuery({
          url: '/telegram/accounts/sign-in',
          method: 'POST',
          body: { attemptId, code },
        })
        return result.error ? { error: result.error } : { data: result.data as SignInResponse }
      },
      invalidatesTags: (result) => (result?.status === 'connected' ? [LIST_TAG] : []),
    }),

    submitPassword: build.mutation<SubmitPasswordResponse, SubmitPasswordRequest>({
      queryFn: async ({ attemptId, password }, _api, _extra, baseQuery) => {
        if (IS_MOCK_TELEGRAM) {
          return runMock(() => telegramMockDb.submitPassword(attemptId, password), 700)
        }
        const result = await baseQuery({
          url: '/telegram/accounts/password',
          method: 'POST',
          body: { attemptId, password },
        })
        return result.error
          ? { error: result.error }
          : { data: result.data as SubmitPasswordResponse }
      },
      invalidatesTags: [LIST_TAG],
    }),
  }),
})

export const { useSendCodeMutation, useSignInMutation, useSubmitPasswordMutation } = connectApi
