import { baseApi } from '@/shared/api'
import type { AccountStatsQuery } from '@/shared/api'
import type { AccountStats, TelegramAccount } from '../model/types'

export const TELEGRAM_ACCOUNT_TAG = 'TelegramAccount' as const
export const ACCOUNT_STATS_TAG = 'AccountStats' as const

/** Дни статистики считаются в зоне пользователя, а не сервера. */
const BROWSER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * Чтение аккаунтов и их статистики. Мутации (подключить, удалить) живут
 * в features и инвалидируют эти теги.
 */
export const accountsApi = baseApi
  .enhanceEndpoints({ addTagTypes: [TELEGRAM_ACCOUNT_TAG, ACCOUNT_STATS_TAG] })
  .injectEndpoints({
    endpoints: (build) => ({
      getAccounts: build.query<TelegramAccount[], void>({
        query: () => ({ url: '/telegram/accounts' }),
        providesTags: (accounts) => [
          { type: TELEGRAM_ACCOUNT_TAG, id: 'LIST' },
          ...(accounts ?? []).map(({ id }) => ({ type: TELEGRAM_ACCOUNT_TAG, id })),
        ],
      }),

      getAccount: build.query<TelegramAccount, string>({
        query: (accountId) => ({ url: `/telegram/accounts/${accountId}` }),
        providesTags: (_result, _error, id) => [{ type: TELEGRAM_ACCOUNT_TAG, id }],
      }),

      getAccountStats: build.query<AccountStats, AccountStatsQuery>({
        query: ({ accountId, from, to, tz }) => ({
          url: `/telegram/accounts/${accountId}/stats`,
          params: { from, to, tz: tz ?? BROWSER_TIMEZONE },
        }),
        providesTags: (_result, _error, { accountId }) => [
          { type: ACCOUNT_STATS_TAG, id: accountId },
        ],
      }),
    }),
  })

export const { useGetAccountsQuery, useGetAccountQuery, useGetAccountStatsQuery } =
  accountsApi
