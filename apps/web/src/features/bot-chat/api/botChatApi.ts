import { BOT_CHAT_TAG } from '@/shared/api'
import type { ChatBotStateResponse, ManualChatMode } from '@/shared/api'
import { botApi } from '@/entities/bot'

/** Режим агента в конкретном чате: вести (в том числе вернуть от менеджера) или выключить. */
export const botChatApi = botApi.injectEndpoints({
  endpoints: (build) => ({
    setChatMode: build.mutation<ChatBotStateResponse, { accountId: string; chatId: string; mode: ManualChatMode }>({
      query: ({ accountId, chatId, mode }) => ({
        url: `/telegram/accounts/${accountId}/chats/${chatId}/bot/mode`,
        method: 'PUT',
        body: { mode },
      }),
      invalidatesTags: (_result, _error, { accountId, chatId }) => [
        { type: BOT_CHAT_TAG, id: chatId },
        { type: BOT_CHAT_TAG, id: `handoffs-${accountId}` },
      ],
    }),
  }),
})

export const { useSetChatModeMutation } = botChatApi
