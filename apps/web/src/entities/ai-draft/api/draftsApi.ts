import {
  AI_CHAT_TAG,
  AI_DRAFT_TAG,
  AI_OVERVIEW_TAG,
  AI_TURNS_TAG,
  baseApi,
} from '@/shared/api'
import type {
  DraftDto,
  DraftListItemDto,
  DraftToExampleRequest,
  DraftToNoteRequest,
  DraftsQuery,
  SendDraftRequest,
} from '@/shared/api'

interface DraftArgs {
  accountId: string
  draftId: string
  /** Чтобы обновить панель чата после решения. */
  chatId?: string
}

/** Кэши, которые устаревают после любого решения по черновику. */
function invalidateAfterDecision({ accountId, chatId }: DraftArgs) {
  return [
    { type: AI_DRAFT_TAG, id: accountId },
    { type: AI_DRAFT_TAG, id: 'ALL' },
    { type: AI_CHAT_TAG, id: accountId },
    { type: AI_OVERVIEW_TAG, id: accountId },
    ...(chatId ? [{ type: AI_CHAT_TAG, id: chatId }, { type: AI_TURNS_TAG, id: chatId }] : []),
  ]
}

export const draftsApi = baseApi
  // Решение по черновику меняет и состояние чата, и обзор — теги тех кэшей тоже нужны здесь.
  .enhanceEndpoints({ addTagTypes: [AI_DRAFT_TAG, AI_CHAT_TAG, AI_OVERVIEW_TAG, AI_TURNS_TAG] })
  .injectEndpoints({
    endpoints: (build) => ({
      getAccountDrafts: build.query<DraftListItemDto[], { accountId: string } & DraftsQuery>({
        query: ({ accountId, ...params }) => ({ url: `/telegram/accounts/${accountId}/ai/drafts`, params }),
        providesTags: (_result, _error, { accountId }) => [{ type: AI_DRAFT_TAG, id: accountId }],
      }),

      /** Очередь по всем аккаунтам — страница «Требуют внимания». */
      getDrafts: build.query<DraftListItemDto[], DraftsQuery>({
        query: (params) => ({ url: '/drafts', params }),
        providesTags: [{ type: AI_DRAFT_TAG, id: 'ALL' }],
      }),

      sendDraft: build.mutation<DraftDto, DraftArgs & { body: SendDraftRequest }>({
        query: ({ accountId, draftId, body }) => ({
          url: `/telegram/accounts/${accountId}/ai/drafts/${draftId}/send`,
          method: 'POST',
          body,
        }),
        invalidatesTags: (_result, _error, args) => invalidateAfterDecision(args),
      }),

      dismissDraft: build.mutation<DraftDto, DraftArgs>({
        query: ({ accountId, draftId }) => ({
          url: `/telegram/accounts/${accountId}/ai/drafts/${draftId}/dismiss`,
          method: 'POST',
        }),
        invalidatesTags: (_result, _error, args) => invalidateAfterDecision(args),
      }),

      regenerateDraft: build.mutation<DraftDto, DraftArgs>({
        query: ({ accountId, draftId }) => ({
          url: `/telegram/accounts/${accountId}/ai/drafts/${draftId}/regenerate`,
          method: 'POST',
        }),
        invalidatesTags: (_result, _error, args) => invalidateAfterDecision(args),
      }),

      draftToExample: build.mutation<{ id: string }, DraftArgs & { body: DraftToExampleRequest }>({
        query: ({ accountId, draftId, body }) => ({
          url: `/telegram/accounts/${accountId}/ai/drafts/${draftId}/to-example`,
          method: 'POST',
          body,
        }),
      }),

      draftToNote: build.mutation<{ id: string }, DraftArgs & { body: DraftToNoteRequest }>({
        query: ({ accountId, draftId, body }) => ({
          url: `/telegram/accounts/${accountId}/ai/drafts/${draftId}/to-note`,
          method: 'POST',
          body,
        }),
      }),
    }),
  })

export const {
  useGetAccountDraftsQuery,
  useGetDraftsQuery,
  useSendDraftMutation,
  useDismissDraftMutation,
  useRegenerateDraftMutation,
  useDraftToExampleMutation,
  useDraftToNoteMutation,
} = draftsApi
