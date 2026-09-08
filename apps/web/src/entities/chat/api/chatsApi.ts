import { baseApi, runMock, telegramMockDb } from '@/shared/api'
import type { ChatsQuery } from '@/shared/api'
import { IS_MOCK_TELEGRAM } from '@/shared/config'
import type { Chat, Message, MessagesQuery } from '../model/types'

export const CHAT_TAG = 'Chat' as const
export const MESSAGE_TAG = 'Message' as const

export const chatsApi = baseApi
  .enhanceEndpoints({ addTagTypes: [CHAT_TAG, MESSAGE_TAG] })
  .injectEndpoints({
    endpoints: (build) => ({
      getChats: build.query<Chat[], ChatsQuery>({
        queryFn: async ({ accountId }, _api, _extra, baseQuery) => {
          if (IS_MOCK_TELEGRAM) return runMock(() => telegramMockDb.listChats(accountId))
          const result = await baseQuery({ url: `/telegram/accounts/${accountId}/chats` })
          return result.error ? { error: result.error } : { data: result.data as Chat[] }
        },
        providesTags: (_result, _error, { accountId }) => [{ type: CHAT_TAG, id: accountId }],
      }),

      getMessages: build.query<Message[], MessagesQuery>({
        queryFn: async ({ accountId, chatId }, _api, _extra, baseQuery) => {
          if (IS_MOCK_TELEGRAM) {
            return runMock(() => telegramMockDb.listMessages(accountId, chatId), 250)
          }
          const result = await baseQuery({
            url: `/telegram/accounts/${accountId}/chats/${chatId}/messages`,
          })
          return result.error ? { error: result.error } : { data: result.data as Message[] }
        },
        providesTags: (_result, _error, { chatId }) => [{ type: MESSAGE_TAG, id: chatId }],
      }),
    }),
  })

export const { useGetChatsQuery, useGetMessagesQuery } = chatsApi
