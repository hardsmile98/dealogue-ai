import { BOT_SETTINGS_TAG } from '@/shared/api'
import type {
  BotSettingsDto,
  LibraryImportMode,
  LibraryImportResultDto,
  UpdateBotSettingsBody,
} from '@/shared/api'
import { botApi } from '@/entities/bot'

/** Правки настроек агента на аккаунте; каждая инвалидирует настройки целиком. */
export const botSettingsApi = botApi.injectEndpoints({
  endpoints: (build) => ({
    updateBotSettings: build.mutation<
      BotSettingsDto,
      { accountId: string; body: UpdateBotSettingsBody }
    >({
      query: ({ accountId, body }) => ({
        url: `/telegram/accounts/${accountId}/bot`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _error, { accountId }) => [
        { type: BOT_SETTINGS_TAG, id: accountId },
      ],
    }),

    setBotEnabled: build.mutation<BotSettingsDto, { accountId: string; enabled: boolean }>({
      query: ({ accountId, enabled }) => ({
        url: `/telegram/accounts/${accountId}/bot/enabled`,
        method: 'PUT',
        body: { enabled },
      }),
      invalidatesTags: (_result, _error, { accountId }) => [
        { type: BOT_SETTINGS_TAG, id: accountId },
      ],
    }),

    importLibrary: build.mutation<
      LibraryImportResultDto,
      { accountId: string; mode: LibraryImportMode }
    >({
      query: ({ accountId, mode }) => ({
        url: `/telegram/accounts/${accountId}/bot/library/import`,
        method: 'POST',
        body: { mode },
      }),
      invalidatesTags: (_result, _error, { accountId }) => [
        { type: BOT_SETTINGS_TAG, id: accountId },
      ],
    }),
  }),
})

export const { useUpdateBotSettingsMutation, useSetBotEnabledMutation, useImportLibraryMutation } =
  botSettingsApi
