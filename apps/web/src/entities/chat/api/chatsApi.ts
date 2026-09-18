import { CHAT_TAG, MESSAGE_TAG, baseApi } from '@/shared/api'
import type { ChatDto, ChatQuery, ChatsQuery, SendMessageRequest } from '@/shared/api'
import type { Chat, Message, MessagesQuery } from '../model/types'

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

      /** Сообщение клиенту от менеджера из веб-интерфейса. */
      sendMessage: build.mutation<Message, SendMessageRequest>({
        query: ({ accountId, chatId, text }) => ({
          url: `/telegram/accounts/${accountId}/chats/${chatId}/messages`,
          method: 'POST',
          body: { text },
        }),
        invalidatesTags: (_result, _error, { accountId, chatId }) => [
          { type: MESSAGE_TAG, id: chatId },
          { type: CHAT_TAG, id: accountId },
        ],
      }),

      /** Менеджер открыл чат с пометкой — открытые алерты считаются увиденными. */
      markAttentionSeen: build.mutation<{ ok: true }, ChatQuery>({
        query: ({ accountId, chatId }) => ({
          url: `/telegram/accounts/${accountId}/chats/${chatId}/attention/seen`,
          method: 'POST',
        }),
      }),

      clearAttention: build.mutation<ChatDto, ChatQuery>({
        query: ({ accountId, chatId }) => ({
          url: `/telegram/accounts/${accountId}/chats/${chatId}/attention/clear`,
          method: 'POST',
        }),
        invalidatesTags: (_result, _error, { accountId }) => [{ type: CHAT_TAG, id: accountId }],
      }),
    }),
  })

export const {
  useGetChatsQuery,
  useGetMessagesQuery,
  useSendMessageMutation,
  useMarkAttentionSeenMutation,
  useClearAttentionMutation,
} = chatsApi
