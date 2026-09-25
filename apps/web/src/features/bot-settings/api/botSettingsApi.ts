import { BOT_LIBRARY_TAG, BOT_SETTINGS_TAG } from '@/shared/api';
import type {
  BotSettingsDto,
  LibraryImportMode,
  LibraryImportResultDto,
  UpdateBotSettingsBody,
} from '@/shared/api';
import { botApi } from '@/entities/bot';

type AccountArgs = { accountId: string };

const settingsTag = (_result: unknown, _error: unknown, arg: AccountArgs) => [
  { type: BOT_SETTINGS_TAG, id: arg.accountId },
];

/** Правки настроек агента на аккаунте; каждая инвалидирует настройки целиком. */
export const botSettingsApi = botApi.injectEndpoints({
  endpoints: (build) => ({
    updateBotSettings: build.mutation<
      BotSettingsDto,
      AccountArgs & { body: UpdateBotSettingsBody }
    >({
      query: ({ accountId, body }) => ({
        url: `/telegram/accounts/${accountId}/bot`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: settingsTag,
    }),

    setBotEnabled: build.mutation<
      BotSettingsDto,
      AccountArgs & { enabled: boolean }
    >({
      query: ({ accountId, enabled }) => ({
        url: `/telegram/accounts/${accountId}/bot/enabled`,
        method: 'PUT',
        body: { enabled },
      }),
      invalidatesTags: settingsTag,
    }),

    /** Импорт меняет и счётчики в настройках, и сам список библиотеки. */
    importLibrary: build.mutation<
      LibraryImportResultDto,
      AccountArgs & { mode: LibraryImportMode }
    >({
      query: ({ accountId, mode }) => ({
        url: `/telegram/accounts/${accountId}/bot/library/import`,
        method: 'POST',
        body: { mode },
      }),
      invalidatesTags: (_result, _error, { accountId }) => [
        { type: BOT_SETTINGS_TAG, id: accountId },
        { type: BOT_LIBRARY_TAG, id: accountId },
      ],
    }),
  }),
});

export const {
  useUpdateBotSettingsMutation,
  useSetBotEnabledMutation,
  useImportLibraryMutation,
} = botSettingsApi;
