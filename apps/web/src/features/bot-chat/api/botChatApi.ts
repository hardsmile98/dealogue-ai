import {
  BOT_CHAT_TAG,
  BOT_HANDOFFS_TAG,
  CHAT_LIST_TAG,
  CHAT_TAG,
} from '@/shared/api';
import type {
  ChatBotStateResponse,
  ChatQuery,
  ManualChatMode,
} from '@/shared/api';
import { botApi } from '@/entities/bot';

/** Режим агента в конкретном чате: вести (в том числе вернуть от менеджера) или выключить. */
export const botChatApi = botApi.injectEndpoints({
  endpoints: (build) => ({
    setChatMode: build.mutation<
      ChatBotStateResponse,
      ChatQuery & { mode: ManualChatMode }
    >({
      query: ({ accountId, chatId, mode }) => ({
        url: `/telegram/accounts/${accountId}/chats/${chatId}/bot/mode`,
        method: 'PUT',
        body: { mode },
      }),
      // Режим виден и в списке чатов, и в самом чате.
      invalidatesTags: (_result, _error, { accountId, chatId }) => [
        { type: BOT_CHAT_TAG, id: chatId },
        { type: BOT_HANDOFFS_TAG, id: accountId },
        { type: CHAT_LIST_TAG, id: accountId },
        { type: CHAT_TAG, id: chatId },
      ],
    }),
  }),
});

export const { useSetChatModeMutation } = botChatApi;
