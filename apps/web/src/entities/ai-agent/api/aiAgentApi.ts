import { baseApi } from '@/shared/api'
import type { AiHealthDto, AiProvidersResponse, AiSettingsDto, UpdateAiSettingsRequest } from '@/shared/api'

export const AI_SETTINGS_TAG = 'AiSettings' as const
export const AI_HEALTH_TAG = 'AiHealth' as const

export const aiAgentApi = baseApi
  .enhanceEndpoints({ addTagTypes: [AI_SETTINGS_TAG, AI_HEALTH_TAG] })
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
        invalidatesTags: (_result, _error, { accountId }) => [{ type: AI_SETTINGS_TAG, id: accountId }],
      }),

      getAiProviders: build.query<AiProvidersResponse, void>({
        query: () => ({ url: '/ai/providers' }),
        providesTags: [{ type: AI_HEALTH_TAG, id: 'PROVIDERS' }],
      }),

      getAiHealth: build.query<AiHealthDto, void>({
        query: () => ({ url: '/ai/health' }),
        providesTags: [{ type: AI_HEALTH_TAG, id: 'HEALTH' }],
      }),
    }),
  })

export const { useGetAiSettingsQuery, useUpdateAiSettingsMutation, useGetAiProvidersQuery, useGetAiHealthQuery } =
  aiAgentApi
