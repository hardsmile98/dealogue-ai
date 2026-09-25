import { TELEGRAM_ACCOUNT_TAG } from '@/shared/api';
import { ACCOUNTS_LIST_TAG, accountsApi } from '@/entities/telegram-account';

export const removeApi = accountsApi.injectEndpoints({
  endpoints: (build) => ({
    removeAccount: build.mutation<void, string>({
      query: (accountId) => ({
        url: `/telegram/accounts/${accountId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id) => [
        ACCOUNTS_LIST_TAG,
        { type: TELEGRAM_ACCOUNT_TAG, id },
      ],
    }),
  }),
});

export const { useRemoveAccountMutation } = removeApi;
