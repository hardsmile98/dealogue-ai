import { BOT_LIBRARY_TAG, BOT_SETTINGS_TAG } from '@/shared/api';
import type { LibraryItemBody, LibraryItemDto } from '@/shared/api';
import { botApi } from '@/entities/bot';

type AccountArgs = { accountId: string };

/** Правка библиотеки меняет и счётчики в настройках агента. */
const libraryTags = (_result: unknown, _error: unknown, arg: AccountArgs) => [
  { type: BOT_LIBRARY_TAG, id: arg.accountId },
  { type: BOT_SETTINGS_TAG, id: arg.accountId },
];

/** Библиотека агента: тексты вех, образцы фраз, возражения, «о себе». */
export const libraryApi = botApi.injectEndpoints({
  endpoints: (build) => ({
    listLibrary: build.query<LibraryItemDto[], string>({
      query: (accountId) => ({
        url: `/telegram/accounts/${accountId}/bot/library`,
      }),
      providesTags: (_result, _error, accountId) => [
        { type: BOT_LIBRARY_TAG, id: accountId },
      ],
    }),

    createLibraryItem: build.mutation<
      LibraryItemDto,
      AccountArgs & { body: LibraryItemBody }
    >({
      query: ({ accountId, body }) => ({
        url: `/telegram/accounts/${accountId}/bot/library`,
        method: 'POST',
        body,
      }),
      invalidatesTags: libraryTags,
    }),

    updateLibraryItem: build.mutation<
      LibraryItemDto,
      AccountArgs & { itemId: string; body: Partial<LibraryItemBody> }
    >({
      query: ({ accountId, itemId, body }) => ({
        url: `/telegram/accounts/${accountId}/bot/library/${itemId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: libraryTags,
    }),

    deleteLibraryItem: build.mutation<void, AccountArgs & { itemId: string }>({
      query: ({ accountId, itemId }) => ({
        url: `/telegram/accounts/${accountId}/bot/library/${itemId}`,
        method: 'DELETE',
      }),
      invalidatesTags: libraryTags,
    }),
  }),
});

export const {
  useListLibraryQuery,
  useCreateLibraryItemMutation,
  useUpdateLibraryItemMutation,
  useDeleteLibraryItemMutation,
} = libraryApi;
