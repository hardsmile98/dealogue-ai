import { BOT_LIBRARY_TAG, BOT_SETTINGS_TAG } from '@/shared/api'
import type { LibraryItemBody, LibraryItemDto } from '@/shared/api'
import { botApi } from '@/entities/bot'

/** Библиотека агента: правка меняет и счётчики в настройках. */
export const libraryApi = botApi.enhanceEndpoints({ addTagTypes: [BOT_LIBRARY_TAG] }).injectEndpoints({
  endpoints: (build) => ({
    listLibrary: build.query<LibraryItemDto[], string>({
      query: (accountId) => ({ url: `/telegram/accounts/${accountId}/bot/library` }),
      providesTags: (_result, _error, accountId) => [{ type: BOT_LIBRARY_TAG, id: accountId }],
    }),
    createLibraryItem: build.mutation<LibraryItemDto, { accountId: string; body: LibraryItemBody }>({
      query: ({ accountId, body }) => ({ url: `/telegram/accounts/${accountId}/bot/library`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { accountId }) => [
        { type: BOT_LIBRARY_TAG, id: accountId },
        { type: BOT_SETTINGS_TAG, id: accountId },
      ],
    }),
    updateLibraryItem: build.mutation<LibraryItemDto, { accountId: string; itemId: string; body: Partial<LibraryItemBody> }>({
      query: ({ accountId, itemId, body }) => ({ url: `/telegram/accounts/${accountId}/bot/library/${itemId}`, method: 'PUT', body }),
      invalidatesTags: (_result, _error, { accountId }) => [
        { type: BOT_LIBRARY_TAG, id: accountId },
        { type: BOT_SETTINGS_TAG, id: accountId },
      ],
    }),
    deleteLibraryItem: build.mutation<void, { accountId: string; itemId: string }>({
      query: ({ accountId, itemId }) => ({ url: `/telegram/accounts/${accountId}/bot/library/${itemId}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, { accountId }) => [
        { type: BOT_LIBRARY_TAG, id: accountId },
        { type: BOT_SETTINGS_TAG, id: accountId },
      ],
    }),
  }),
})

export const { useListLibraryQuery, useCreateLibraryItemMutation, useUpdateLibraryItemMutation, useDeleteLibraryItemMutation } = libraryApi
