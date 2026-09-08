import { runMock, telegramMockDb } from '@/shared/api'
import { IS_MOCK_TELEGRAM } from '@/shared/config'
import { TELEGRAM_ACCOUNT_TAG, accountsApi } from '@/entities/telegram-account'

export const removeApi = accountsApi.injectEndpoints({
  endpoints: (build) => ({
    removeAccount: build.mutation<void, string>({
      queryFn: async (accountId, _api, _extra, baseQuery) => {
        if (IS_MOCK_TELEGRAM) {
          return runMock(() => telegramMockDb.deleteAccount(accountId), 500)
        }
        const result = await baseQuery({
          url: `/telegram/accounts/${accountId}`,
          method: 'DELETE',
        })
        return result.error ? { error: result.error } : { data: undefined }
      },
      invalidatesTags: (_result, _error, id) => [
        { type: TELEGRAM_ACCOUNT_TAG, id: 'LIST' },
        { type: TELEGRAM_ACCOUNT_TAG, id },
      ],
    }),
  }),
})

export const { useRemoveAccountMutation } = removeApi
