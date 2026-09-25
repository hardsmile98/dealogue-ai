import { BOT_EXAMPLES_TAG } from '@/shared/api'
import type { ExampleBody, ExampleDto } from '@/shared/api'
import { botApi } from '@/entities/bot'

/** Примеры реальных диалогов — образцы ответов агента по этапам. */
export const examplesApi = botApi.enhanceEndpoints({ addTagTypes: [BOT_EXAMPLES_TAG] }).injectEndpoints({
  endpoints: (build) => ({
    listExamples: build.query<ExampleDto[], string>({
      query: (accountId) => ({ url: `/telegram/accounts/${accountId}/bot/examples` }),
      providesTags: (_result, _error, accountId) => [{ type: BOT_EXAMPLES_TAG, id: accountId }],
    }),
    createExample: build.mutation<ExampleDto, { accountId: string; body: ExampleBody }>({
      query: ({ accountId, body }) => ({ url: `/telegram/accounts/${accountId}/bot/examples`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { accountId }) => [{ type: BOT_EXAMPLES_TAG, id: accountId }],
    }),
    updateExample: build.mutation<ExampleDto, { accountId: string; exampleId: string; body: Partial<ExampleBody> }>({
      query: ({ accountId, exampleId, body }) => ({
        url: `/telegram/accounts/${accountId}/bot/examples/${exampleId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _error, { accountId }) => [{ type: BOT_EXAMPLES_TAG, id: accountId }],
    }),
    deleteExample: build.mutation<void, { accountId: string; exampleId: string }>({
      query: ({ accountId, exampleId }) => ({ url: `/telegram/accounts/${accountId}/bot/examples/${exampleId}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, { accountId }) => [{ type: BOT_EXAMPLES_TAG, id: accountId }],
    }),
  }),
})

export const { useListExamplesQuery, useCreateExampleMutation, useUpdateExampleMutation, useDeleteExampleMutation } = examplesApi
