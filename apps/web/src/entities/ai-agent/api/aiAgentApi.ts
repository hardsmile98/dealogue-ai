import { baseApi } from '@/shared/api'
import type {
  AiHealthDto,
  AiOverviewDto,
  AiProvidersResponse,
  AiSettingsDto,
  ChatAiStateDto,
  ChatAiSummaryDto,
  PatchChatAiRequest,
  RateTurnRequest,
  ResumeChatAiRequest,
  SandboxRequest,
  SandboxResponse,
  TouchKind,
  TurnDto,
  UpdateAiSettingsRequest,
} from '@/shared/api'

export const AI_SETTINGS_TAG = 'AiSettings' as const
export const AI_HEALTH_TAG = 'AiHealth' as const
/** Состояние одного чата (id = chatId) и сводка по аккаунту (id = accountId). */
export const AI_CHAT_TAG = 'AiChat' as const
/** Журнал ходов чата (id = chatId). */
export const AI_TURNS_TAG = 'AiTurns' as const
export const AI_OVERVIEW_TAG = 'AiOverview' as const

interface ChatArgs {
  accountId: string
  chatId: string
}

export const aiAgentApi = baseApi
  .enhanceEndpoints({ addTagTypes: [AI_SETTINGS_TAG, AI_HEALTH_TAG, AI_CHAT_TAG, AI_TURNS_TAG, AI_OVERVIEW_TAG] })
  .injectEndpoints({
    endpoints: (build) => ({
      getAiSettings: build.query<AiSettingsDto, string>({
        query: (accountId) => ({ url: `/telegram/accounts/${accountId}/ai/settings` }),
        providesTags: (_result, _error, accountId) => [{ type: AI_SETTINGS_TAG, id: accountId }],
      }),

      updateAiSettings: build.mutation<AiSettingsDto, { accountId: string; patch: UpdateAiSettingsRequest }>({
        query: ({ accountId, patch }) => ({
          url: `/telegram/accounts/${accountId}/ai/settings`,
          method: 'PUT',
          body: patch,
        }),
        invalidatesTags: (_result, _error, { accountId }) => [
          { type: AI_SETTINGS_TAG, id: accountId },
          { type: AI_OVERVIEW_TAG, id: accountId },
        ],
      }),

      getAiProviders: build.query<AiProvidersResponse, void>({
        query: () => ({ url: '/ai/providers' }),
        providesTags: [{ type: AI_HEALTH_TAG, id: 'PROVIDERS' }],
      }),

      getAiHealth: build.query<AiHealthDto, void>({
        query: () => ({ url: '/ai/health' }),
        providesTags: [{ type: AI_HEALTH_TAG, id: 'HEALTH' }],
      }),

      // --- ход агента --------------------------------------------------------

      getAiOverview: build.query<AiOverviewDto, string>({
        query: (accountId) => ({ url: `/telegram/accounts/${accountId}/ai/overview` }),
        providesTags: (_result, _error, accountId) => [{ type: AI_OVERVIEW_TAG, id: accountId }],
      }),

      getChatAiSummaries: build.query<ChatAiSummaryDto[], string>({
        query: (accountId) => ({ url: `/telegram/accounts/${accountId}/ai/chats` }),
        providesTags: (_result, _error, accountId) => [{ type: AI_CHAT_TAG, id: accountId }],
      }),

      getChatAi: build.query<ChatAiStateDto, ChatArgs>({
        query: ({ accountId, chatId }) => ({ url: `/telegram/accounts/${accountId}/chats/${chatId}/ai` }),
        providesTags: (_result, _error, { chatId }) => [{ type: AI_CHAT_TAG, id: chatId }],
      }),

      patchChatAi: build.mutation<ChatAiStateDto, ChatArgs & { patch: PatchChatAiRequest }>({
        query: ({ accountId, chatId, patch }) => ({
          url: `/telegram/accounts/${accountId}/chats/${chatId}/ai`,
          method: 'PATCH',
          body: patch,
        }),
        invalidatesTags: (_result, _error, { accountId, chatId }) => [
          { type: AI_CHAT_TAG, id: chatId },
          { type: AI_CHAT_TAG, id: accountId },
          { type: AI_OVERVIEW_TAG, id: accountId },
        ],
      }),

      resumeChatAi: build.mutation<ChatAiStateDto, ChatArgs & { body: ResumeChatAiRequest }>({
        query: ({ accountId, chatId, body }) => ({
          url: `/telegram/accounts/${accountId}/chats/${chatId}/ai/resume`,
          method: 'POST',
          body,
        }),
        invalidatesTags: (_result, _error, { accountId, chatId }) => [
          { type: AI_CHAT_TAG, id: chatId },
          { type: AI_CHAT_TAG, id: accountId },
          { type: AI_OVERVIEW_TAG, id: accountId },
        ],
      }),

      manualTurn: build.mutation<{ ok: true }, ChatArgs & { touchKind: TouchKind | null }>({
        query: ({ accountId, chatId, touchKind }) => ({
          url: `/telegram/accounts/${accountId}/chats/${chatId}/ai/turn`,
          method: 'POST',
          body: { touchKind },
        }),
        invalidatesTags: (_result, _error, { chatId }) => [{ type: AI_CHAT_TAG, id: chatId }],
      }),

      getChatTurns: build.query<TurnDto[], ChatArgs & { limit?: number }>({
        query: ({ accountId, chatId, limit = 50 }) => ({
          url: `/telegram/accounts/${accountId}/chats/${chatId}/ai/turns`,
          params: { limit },
        }),
        providesTags: (_result, _error, { chatId }) => [{ type: AI_TURNS_TAG, id: chatId }],
      }),

      rateTurn: build.mutation<TurnDto, ChatArgs & { turnId: string; body: RateTurnRequest }>({
        query: ({ accountId, chatId, turnId, body }) => ({
          url: `/telegram/accounts/${accountId}/chats/${chatId}/ai/turns/${turnId}/rate`,
          method: 'POST',
          body,
        }),
        invalidatesTags: (_result, _error, { chatId }) => [{ type: AI_TURNS_TAG, id: chatId }],
      }),

      runSandbox: build.mutation<SandboxResponse, { accountId: string; body: SandboxRequest }>({
        query: ({ accountId, body }) => ({
          url: `/telegram/accounts/${accountId}/ai/sandbox`,
          method: 'POST',
          body,
        }),
      }),
    }),
  })

export const {
  useGetAiSettingsQuery,
  useUpdateAiSettingsMutation,
  useGetAiProvidersQuery,
  useGetAiHealthQuery,
  useGetAiOverviewQuery,
  useGetChatAiSummariesQuery,
  useGetChatAiQuery,
  usePatchChatAiMutation,
  useResumeChatAiMutation,
  useManualTurnMutation,
  useGetChatTurnsQuery,
  useRateTurnMutation,
  useRunSandboxMutation,
} = aiAgentApi
