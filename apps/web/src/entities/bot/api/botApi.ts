import {
  BOT_CHAT_TAG,
  BOT_HANDOFFS_TAG,
  BOT_SETTINGS_TAG,
  baseApi,
} from '@/shared/api';
import type {
  BotSettingsDto,
  ChatBotStateResponse,
  ChatJournalResponse,
  ChatQuery,
  HandoffChatDto,
} from '@/shared/api';

/**
 * Чтение настроек агента, его состояния и журнала в чате, списка «у
 * менеджера». Мутации (образ, тайминги, режим чата, библиотека, примеры)
 * живут в features и инвалидируют эти теги.
 */
export const botApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getBotSettings: build.query<BotSettingsDto, string>({
      query: (accountId) => ({ url: `/telegram/accounts/${accountId}/bot` }),
      providesTags: (_result, _error, accountId) => [
        { type: BOT_SETTINGS_TAG, id: accountId },
      ],
    }),

    getChatBotState: build.query<ChatBotStateResponse, ChatQuery>({
      query: ({ accountId, chatId }) => ({
        url: `/telegram/accounts/${accountId}/chats/${chatId}/bot`,
      }),
      providesTags: (_result, _error, { chatId }) => [
        { type: BOT_CHAT_TAG, id: chatId },
      ],
    }),

    /** Журнал агента в чате: память, задания, ходы; null — агент чат не вёл. */
    getChatJournal: build.query<ChatJournalResponse, ChatQuery>({
      query: ({ accountId, chatId }) => ({
        url: `/telegram/accounts/${accountId}/chats/${chatId}/bot/journal`,
      }),
      providesTags: (_result, _error, { chatId }) => [
        { type: BOT_CHAT_TAG, id: chatId },
      ],
    }),

    /** Чаты у менеджера: ждущие ответа сверху. */
    getHandoffs: build.query<HandoffChatDto[], string>({
      query: (accountId) => ({
        url: `/telegram/accounts/${accountId}/bot/handoffs`,
      }),
      providesTags: (_result, _error, accountId) => [
        { type: BOT_HANDOFFS_TAG, id: accountId },
      ],
    }),
  }),
});

export const {
  useGetBotSettingsQuery,
  useGetChatBotStateQuery,
  useGetChatJournalQuery,
  useGetHandoffsQuery,
} = botApi;
