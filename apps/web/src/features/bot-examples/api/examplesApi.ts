import { BOT_EXAMPLES_TAG } from '@/shared/api';
import type { ExampleBody, ExampleDto } from '@/shared/api';
import { botApi } from '@/entities/bot';

type AccountArgs = { accountId: string };

const examplesTag = (_result: unknown, _error: unknown, arg: AccountArgs) => [
  { type: BOT_EXAMPLES_TAG, id: arg.accountId },
];

/** Примеры реальных диалогов — образцы ответов агента по этапам. */
export const examplesApi = botApi.injectEndpoints({
  endpoints: (build) => ({
    listExamples: build.query<ExampleDto[], string>({
      query: (accountId) => ({
        url: `/telegram/accounts/${accountId}/bot/examples`,
      }),
      providesTags: (_result, _error, accountId) => [
        { type: BOT_EXAMPLES_TAG, id: accountId },
      ],
    }),

    createExample: build.mutation<
      ExampleDto,
      AccountArgs & { body: ExampleBody }
    >({
      query: ({ accountId, body }) => ({
        url: `/telegram/accounts/${accountId}/bot/examples`,
        method: 'POST',
        body,
      }),
      invalidatesTags: examplesTag,
    }),

    updateExample: build.mutation<
      ExampleDto,
      AccountArgs & { exampleId: string; body: Partial<ExampleBody> }
    >({
      query: ({ accountId, exampleId, body }) => ({
        url: `/telegram/accounts/${accountId}/bot/examples/${exampleId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: examplesTag,
    }),

    deleteExample: build.mutation<void, AccountArgs & { exampleId: string }>({
      query: ({ accountId, exampleId }) => ({
        url: `/telegram/accounts/${accountId}/bot/examples/${exampleId}`,
        method: 'DELETE',
      }),
      invalidatesTags: examplesTag,
    }),
  }),
});

export const {
  useListExamplesQuery,
  useCreateExampleMutation,
  useUpdateExampleMutation,
  useDeleteExampleMutation,
} = examplesApi;
