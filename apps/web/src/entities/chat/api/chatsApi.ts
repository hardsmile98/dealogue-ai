import {
  BOT_CHAT_TAG,
  BOT_HANDOFFS_TAG,
  CHATS_PAGE_SIZE,
  CHAT_LIST_TAG,
  CHAT_TAG,
  MESSAGES_PAGE_SIZE,
  MESSAGE_TAG,
  baseApi,
} from '@/shared/api';
import type {
  ChatQuery,
  ChatsPageDto,
  ChatsQuery,
  MessagesPageDto,
  SendMessageRequest,
} from '@/shared/api';
import type { Chat, Message } from '../model/types';

export const chatsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * Список чатов страницами по курсору. Поиск и фильтр — на сервере:
     * на клиенте они видели бы только уже загруженные страницы. При
     * инвалидации RTK Query перезапрашивает все загруженные страницы по порядку.
     */
    getChats: build.infiniteQuery<ChatsPageDto, ChatsQuery, string | null>({
      infiniteQueryOptions: {
        initialPageParam: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
      query: ({ queryArg: { accountId, search, code }, pageParam }) => ({
        url: `/telegram/accounts/${accountId}/chats`,
        params: {
          search: search || undefined,
          code,
          cursor: pageParam ?? undefined,
          limit: CHATS_PAGE_SIZE,
        },
      }),
      providesTags: (_result, _error, { accountId }) => [
        { type: CHAT_LIST_TAG, id: accountId },
      ],
    }),

    /** Один чат — открыт по ссылке, а в загруженных страницах его может не быть. */
    getChat: build.query<Chat, ChatQuery>({
      query: ({ accountId, chatId }) => ({
        url: `/telegram/accounts/${accountId}/chats/${chatId}`,
      }),
      providesTags: (_result, _error, { chatId }) => [
        { type: CHAT_TAG, id: chatId },
      ],
    }),

    /**
     * Переписка страницами от новых к старым: «следующая» страница — более
     * старые сообщения. При инвалидации RTK Query перезапрашивает загруженные
     * страницы начиная со свежей, так что новые сообщения попадают в первую,
     * а курсоры остальных пересчитываются от неё — без дыр и дублей.
     */
    getMessages: build.infiniteQuery<MessagesPageDto, ChatQuery, string | null>(
      {
        infiniteQueryOptions: {
          initialPageParam: null,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        },
        query: ({ queryArg: { accountId, chatId }, pageParam }) => ({
          url: `/telegram/accounts/${accountId}/chats/${chatId}/messages`,
          params: { cursor: pageParam ?? undefined, limit: MESSAGES_PAGE_SIZE },
        }),
        providesTags: (_result, _error, { chatId }) => [
          { type: MESSAGE_TAG, id: chatId },
        ],
      },
    ),

    /**
     * Сообщение клиенту от менеджера из веб-интерфейса. Для агента это
     * «чужое исходящее»: чат уходит менеджеру, поэтому обновляем и его
     * состояние, и список «у менеджера».
     */
    sendMessage: build.mutation<Message, SendMessageRequest>({
      query: ({ accountId, chatId, text }) => ({
        url: `/telegram/accounts/${accountId}/chats/${chatId}/messages`,
        method: 'POST',
        body: { text },
      }),
      invalidatesTags: (_result, _error, { accountId, chatId }) => [
        { type: MESSAGE_TAG, id: chatId },
        { type: CHAT_LIST_TAG, id: accountId },
        { type: BOT_CHAT_TAG, id: chatId },
        { type: BOT_HANDOFFS_TAG, id: accountId },
      ],
    }),
  }),
});

export const {
  useGetChatsInfiniteQuery,
  useGetChatQuery,
  useGetMessagesInfiniteQuery,
  useSendMessageMutation,
} = chatsApi;
