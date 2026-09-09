import type {
  AiProvidersResponse,
  AiRunDto,
  AiSettingsDto,
  ChatAiQuery,
  ChatDto,
  LearningStatusDto,
  SetChatAiRequest,
  StyleProfileDto,
  StyleProfileOverridesDto,
  TestGenerateRequest,
  TestGenerateResponse,
  UpdateAiSettingsRequest,
} from '@/shared/api'
import { CHAT_TAG, chatsApi } from '@/entities/chat'

export const AI_SETTINGS_TAG = 'AiSettings' as const
export const AI_PROFILE_TAG = 'AiProfile' as const
export const AI_LEARNING_TAG = 'AiLearning' as const
export const AI_RUNS_TAG = 'AiRuns' as const

/**
 * Настройки, обучение и управление ИИ-агентом. Инжектится в chatsApi,
 * чтобы включение ИИ в чате инвалидировало список чатов теми же тегами.
 */
export const aiAgentApi = chatsApi
  .enhanceEndpoints({ addTagTypes: [AI_SETTINGS_TAG, AI_PROFILE_TAG, AI_LEARNING_TAG, AI_RUNS_TAG] })
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
          { type: AI_LEARNING_TAG, id: accountId },
        ],
      }),

      getAiProviders: build.query<AiProvidersResponse, void>({
        query: () => ({ url: '/ai/providers' }),
      }),

      getLearningStatus: build.query<LearningStatusDto, string>({
        query: (accountId) => ({ url: `/telegram/accounts/${accountId}/ai/learning` }),
        providesTags: (_result, _error, accountId) => [
          { type: AI_LEARNING_TAG, id: accountId },
          { type: AI_PROFILE_TAG, id: accountId },
        ],
      }),

      startImport: build.mutation<{ started: true }, string>({
        query: (accountId) => ({ url: `/telegram/accounts/${accountId}/ai/import`, method: 'POST' }),
        invalidatesTags: (_result, _error, accountId) => [{ type: AI_LEARNING_TAG, id: accountId }],
      }),

      startLearning: build.mutation<{ started: true }, string>({
        query: (accountId) => ({ url: `/telegram/accounts/${accountId}/ai/learn`, method: 'POST' }),
        invalidatesTags: (_result, _error, accountId) => [{ type: AI_LEARNING_TAG, id: accountId }],
      }),

      cancelLearning: build.mutation<{ cancelled: true }, string>({
        query: (accountId) => ({ url: `/telegram/accounts/${accountId}/ai/learn/cancel`, method: 'POST' }),
        invalidatesTags: (_result, _error, accountId) => [{ type: AI_LEARNING_TAG, id: accountId }],
      }),

      updateProfileOverrides: build.mutation<
        StyleProfileDto,
        { accountId: string; overrides: StyleProfileOverridesDto | null }
      >({
        query: ({ accountId, overrides }) => ({
          url: `/telegram/accounts/${accountId}/ai/profile/overrides`,
          method: 'PUT',
          body: { overrides },
        }),
        invalidatesTags: (_result, _error, { accountId }) => [
          { type: AI_PROFILE_TAG, id: accountId },
          { type: AI_LEARNING_TAG, id: accountId },
        ],
      }),

      setChatAi: build.mutation<ChatDto, SetChatAiRequest>({
        query: ({ accountId, chatId, enabled }) => ({
          url: `/telegram/accounts/${accountId}/chats/${chatId}/ai`,
          method: 'PATCH',
          body: { enabled },
        }),
        invalidatesTags: (_result, _error, { accountId }) => [{ type: CHAT_TAG, id: accountId }],
      }),

      stopFollowups: build.mutation<ChatDto, ChatAiQuery>({
        query: ({ accountId, chatId }) => ({
          url: `/telegram/accounts/${accountId}/chats/${chatId}/ai/followups/stop`,
          method: 'POST',
        }),
        invalidatesTags: (_result, _error, { accountId }) => [{ type: CHAT_TAG, id: accountId }],
      }),

      testGenerate: build.mutation<TestGenerateResponse, TestGenerateRequest>({
        query: ({ accountId, chatId, scriptOverride, followupStep }) => ({
          url: `/telegram/accounts/${accountId}/chats/${chatId}/ai/test`,
          method: 'POST',
          body: {
            ...(scriptOverride ? { scriptOverride } : {}),
            ...(followupStep !== undefined ? { followupStep } : {}),
          },
        }),
        invalidatesTags: (_result, _error, { chatId }) => [{ type: AI_RUNS_TAG, id: chatId }],
      }),

      getChatRuns: build.query<AiRunDto[], ChatAiQuery & { limit?: number }>({
        query: ({ accountId, chatId, limit }) => ({
          url: `/telegram/accounts/${accountId}/chats/${chatId}/ai/runs`,
          params: limit ? { limit } : undefined,
        }),
        providesTags: (_result, _error, { chatId }) => [{ type: AI_RUNS_TAG, id: chatId }],
      }),

      markAttentionSeen: build.mutation<{ ok: true }, ChatAiQuery>({
        query: ({ accountId, chatId }) => ({
          url: `/telegram/accounts/${accountId}/chats/${chatId}/attention/seen`,
          method: 'POST',
        }),
      }),

      clearAttention: build.mutation<ChatDto, ChatAiQuery>({
        query: ({ accountId, chatId }) => ({
          url: `/telegram/accounts/${accountId}/chats/${chatId}/attention/clear`,
          method: 'POST',
        }),
        invalidatesTags: (_result, _error, { accountId }) => [{ type: CHAT_TAG, id: accountId }],
      }),
    }),
  })

export const {
  useGetAiSettingsQuery,
  useUpdateAiSettingsMutation,
  useGetAiProvidersQuery,
  useGetLearningStatusQuery,
  useStartImportMutation,
  useStartLearningMutation,
  useCancelLearningMutation,
  useUpdateProfileOverridesMutation,
  useSetChatAiMutation,
  useStopFollowupsMutation,
  useTestGenerateMutation,
  useGetChatRunsQuery,
  useMarkAttentionSeenMutation,
  useClearAttentionMutation,
} = aiAgentApi
