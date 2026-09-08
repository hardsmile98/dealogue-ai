import { baseApi, runMock, telegramMockDb } from '@/shared/api'
import type { AccountStatsQuery } from '@/shared/api'
import { IS_MOCK_TELEGRAM } from '@/shared/config'
import type { AccountStats, TelegramAccount } from '../model/types'

export const TELEGRAM_ACCOUNT_TAG = 'TelegramAccount' as const
export const ACCOUNT_STATS_TAG = 'AccountStats' as const

/**
 * Чтение аккаунтов и их статистики. Мутации (подключить, удалить) живут
 * в features и инвалидируют эти теги.
 */
export const accountsApi = baseApi
  .enhanceEndpoints({ addTagTypes: [TELEGRAM_ACCOUNT_TAG, ACCOUNT_STATS_TAG] })
  .injectEndpoints({
    endpoints: (build) => ({
      getAccounts: build.query<TelegramAccount[], void>({
        queryFn: async (_arg, _api, _extra, baseQuery) => {
          if (IS_MOCK_TELEGRAM) return runMock(() => telegramMockDb.listAccounts())
          const result = await baseQuery({ url: '/telegram/accounts' })
          return result.error
            ? { error: result.error }
            : { data: result.data as TelegramAccount[] }
        },
        providesTags: (accounts) => [
          { type: TELEGRAM_ACCOUNT_TAG, id: 'LIST' },
          ...(accounts ?? []).map(({ id }) => ({ type: TELEGRAM_ACCOUNT_TAG, id })),
        ],
      }),

      getAccount: build.query<TelegramAccount, string>({
        queryFn: async (accountId, _api, _extra, baseQuery) => {
          if (IS_MOCK_TELEGRAM) return runMock(() => telegramMockDb.getAccount(accountId))
          const result = await baseQuery({ url: `/telegram/accounts/${accountId}` })
          return result.error
            ? { error: result.error }
            : { data: result.data as TelegramAccount }
        },
        providesTags: (_result, _error, id) => [{ type: TELEGRAM_ACCOUNT_TAG, id }],
      }),

      getAccountStats: build.query<AccountStats, AccountStatsQuery>({
        queryFn: async ({ accountId, from, to }, _api, _extra, baseQuery) => {
          if (IS_MOCK_TELEGRAM) {
            return runMock(() => telegramMockDb.getStats(accountId, from, to))
          }
          const result = await baseQuery({
            url: `/telegram/accounts/${accountId}/stats`,
            params: { from, to },
          })
          return result.error
            ? { error: result.error }
            : { data: result.data as AccountStats }
        },
        providesTags: (_result, _error, { accountId }) => [
          { type: ACCOUNT_STATS_TAG, id: accountId },
        ],
      }),
    }),
  })

export const { useGetAccountsQuery, useGetAccountQuery, useGetAccountStatsQuery } =
  accountsApi
