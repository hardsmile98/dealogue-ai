import { BOT_SANDBOX_LIST_TAG, BOT_SANDBOX_TAG } from '@/shared/api';
import type {
  ChatQuery,
  ManualChatMode,
  SandboxSessionDto,
  SandboxSummaryDto,
} from '@/shared/api';
import { botApi } from '@/entities/bot';

export type SessionArgs = { accountId: string; sessionId: string };

const listTag = (
  _result: unknown,
  _error: unknown,
  arg: { accountId: string },
) => [{ type: BOT_SANDBOX_LIST_TAG, id: arg.accountId }];

/**
 * Песочница агента. Каждое действие возвращает сессию целиком — ею и
 * обновляется кэш, без лишнего запроса. Ход и перемотка идут на сервере в
 * фоне: сессия приходит с `running: true`, и страница опрашивает её, пока
 * ход не закончится.
 */
export const sandboxApi = botApi.injectEndpoints({
  endpoints: (build) => {
    /** Мутация над сессией: ответ кладётся в кэш сессии, список помечается устаревшим. */
    const action = <Body>(path: string, method: 'POST' | 'PUT' = 'POST') =>
      build.mutation<SandboxSessionDto, SessionArgs & { body?: Body }>({
        query: ({ accountId, sessionId, body }) => ({
          url: `/telegram/accounts/${accountId}/bot/sandbox/${sessionId}/${path}`,
          method,
          body: body ?? {},
        }),
        async onQueryStarted(
          { accountId, sessionId },
          { dispatch, queryFulfilled },
        ) {
          try {
            const { data } = await queryFulfilled;
            dispatch(
              sandboxApi.util.upsertQueryData(
                'getSandbox',
                { accountId, sessionId },
                data,
              ),
            );
            dispatch(
              sandboxApi.util.invalidateTags([
                { type: BOT_SANDBOX_LIST_TAG, id: accountId },
              ]),
            );
          } catch {
            // Ошибку показывает компонент по результату мутации.
          }
        },
      });

    return {
      listSandboxes: build.query<SandboxSummaryDto[], string>({
        query: (accountId) => ({
          url: `/telegram/accounts/${accountId}/bot/sandbox`,
        }),
        providesTags: (_result, _error, accountId) => [
          { type: BOT_SANDBOX_LIST_TAG, id: accountId },
        ],
      }),

      getSandbox: build.query<SandboxSessionDto, SessionArgs>({
        query: ({ accountId, sessionId }) => ({
          url: `/telegram/accounts/${accountId}/bot/sandbox/${sessionId}`,
        }),
        providesTags: (_result, _error, { sessionId }) => [
          { type: BOT_SANDBOX_TAG, id: sessionId },
        ],
      }),

      createSandbox: build.mutation<
        SandboxSessionDto,
        { accountId: string; title?: string }
      >({
        query: ({ accountId, title }) => ({
          url: `/telegram/accounts/${accountId}/bot/sandbox`,
          method: 'POST',
          body: title ? { title } : {},
        }),
        invalidatesTags: listTag,
      }),

      /** «Продолжить в песочнице» из реального чата: до сообщения включительно или целиком. */
      sandboxFromChat: build.mutation<
        SandboxSessionDto,
        ChatQuery & { messageId?: number }
      >({
        query: ({ accountId, chatId, messageId }) => ({
          url: `/telegram/accounts/${accountId}/chats/${chatId}/bot/sandbox`,
          method: 'POST',
          body: messageId === undefined ? {} : { messageId },
        }),
        invalidatesTags: listTag,
      }),

      deleteSandbox: build.mutation<void, SessionArgs>({
        query: ({ accountId, sessionId }) => ({
          url: `/telegram/accounts/${accountId}/bot/sandbox/${sessionId}`,
          method: 'DELETE',
        }),
        invalidatesTags: listTag,
      }),

      addSandboxMessages: action<{ texts: string[] }>('messages'),
      respondSandbox: action('respond'),
      readSandbox: action('read'),
      advanceSandbox: action<{ minutes?: number }>('advance'),
      setSandboxMode: action<{ mode: ManualChatMode }>('mode', 'PUT'),
    };
  },
});

export const {
  useListSandboxesQuery,
  useGetSandboxQuery,
  useCreateSandboxMutation,
  useSandboxFromChatMutation,
  useDeleteSandboxMutation,
  useAddSandboxMessagesMutation,
  useRespondSandboxMutation,
  useReadSandboxMutation,
  useAdvanceSandboxMutation,
  useSetSandboxModeMutation,
} = sandboxApi;
