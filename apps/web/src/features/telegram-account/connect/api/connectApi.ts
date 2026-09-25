import { TELEGRAM_ACCOUNT_TAG } from '@/shared/api';
import type {
  SendCodeRequest,
  SendCodeResponse,
  SignInRequest,
  SignInResponse,
  SubmitPasswordRequest,
  SubmitPasswordResponse,
  TelegramAccountDto,
} from '@/shared/api';
import { ACCOUNTS_LIST_TAG, accountsApi } from '@/entities/telegram-account';

/**
 * Подключили аккаунт — устарел список, а при переподключении и карточка
 * самого аккаунта: иначе страница аккаунта ещё полминуты показывала бы
 * «Отключён».
 */
function connectedTags(account: TelegramAccountDto | null | undefined) {
  if (!account) return [];
  return [ACCOUNTS_LIST_TAG, { type: TELEGRAM_ACCOUNT_TAG, id: account.id }];
}

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
      invalidatesTags: (result) => connectedTags(result?.account),
    }),

    submitPassword: build.mutation<
      SubmitPasswordResponse,
      SubmitPasswordRequest
    >({
      query: ({ attemptId, password }) => ({
        url: '/telegram/accounts/password',
        method: 'POST',
        body: { attemptId, password },
      }),
      invalidatesTags: (result) => connectedTags(result?.account),
    }),
  }),
});

export const {
  useSendCodeMutation,
  useSignInMutation,
  useSubmitPasswordMutation,
} = connectApi;
