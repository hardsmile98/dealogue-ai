import { baseApi } from '@/shared/api'
import type { ChatsQuery } from '@/shared/api'
import type { Chat, Message, MessagesQuery } from '../model/types'

export const CHAT_TAG = 'Chat' as const
export const MESSAGE_TAG = 'Message' as const

export const chatsApi = baseApi
  .enhanceEndpoints({ addTagTypes: [CHAT_TAG, MESSAGE_TAG] })
  .injectEndpoints({
    endpoints: (build) => ({
      getChats: build.query<Chat[], ChatsQuery>({
        query: ({ accountId }) => ({ url: `/telegram/accounts/${accountId}/chats` }),
        providesTags: (_result, _error, { accountId }) => [{ type: CHAT_TAG, id: accountId }],
      }),

      getMessages: build.query<Message[], MessagesQuery>({
        query: ({ accountId, chatId }) => ({
          url: `/telegram/accounts/${accountId}/chats/${chatId}/messages`,
        }),
        providesTags: (_result, _error, { chatId }) => [{ type: MESSAGE_TAG, id: chatId }],
      }),
    }),
  })

export const { useGetChatsQuery, useGetMessagesQuery } = chatsApi
