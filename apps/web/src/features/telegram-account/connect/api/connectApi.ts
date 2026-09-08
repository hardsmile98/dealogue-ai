import type {
  SendCodeRequest,
  SendCodeResponse,
  SignInRequest,
  SignInResponse,
  SubmitPasswordRequest,
  SubmitPasswordResponse,
} from '@/shared/api'
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
      query: ({ phone }) => ({
        url: '/telegram/accounts/send-code',
        method: 'POST',
        body: { phone },
      }),
    }),

    signIn: build.mutation<SignInResponse, SignInRequest>({
      query: ({ attemptId, code }) => ({
        url: '/telegram/accounts/sign-in',
        method: 'POST',
        body: { attemptId, code },
      }),
      invalidatesTags: (result) => (result?.status === 'connected' ? [LIST_TAG] : []),
    }),

    submitPassword: build.mutation<SubmitPasswordResponse, SubmitPasswordRequest>({
      query: ({ attemptId, password }) => ({
        url: '/telegram/accounts/password',
        method: 'POST',
        body: { attemptId, password },
      }),
      invalidatesTags: [LIST_TAG],
    }),
  }),
})

export const { useSendCodeMutation, useSignInMutation, useSubmitPasswordMutation } = connectApi
