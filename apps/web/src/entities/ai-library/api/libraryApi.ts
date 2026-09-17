import { baseApi } from '@/shared/api'
import type {
  CategoryDto,
  CategoryInput,
  CopyLibraryRequest,
  DiagnosticDto,
  DiagnosticInput,
  DiagnosticsQuery,
  FactDto,
  FactInput,
  FunnelStage,
  LibraryOverviewDto,
  NoteDto,
  NoteInput,
  PhraseDto,
  PhraseInput,
  PhrasesQuery,
  PlaybookDto,
  PlaybookInput,
  PreviewSplitResponse,
  SeedResultDto,
} from '@/shared/api'

export const LIBRARY_TAG = 'AiLibrary' as const

type Scoped<T> = { accountId: string } & T
type ItemArg<T> = { accountId: string; id: string; patch: Partial<T> }

const base = (accountId: string) => `/telegram/accounts/${accountId}/ai`
const tag = (accountId: string, kind: string) => ({ type: LIBRARY_TAG, id: `${kind}:${accountId}` })
const invalidate =
  (...kinds: string[]) =>
  (_result: unknown, _error: unknown, arg: { accountId: string }) => [
    ...kinds.map((kind) => tag(arg.accountId, kind)),
    tag(arg.accountId, 'overview'),
  ]

export const libraryApi = baseApi.enhanceEndpoints({ addTagTypes: [LIBRARY_TAG] }).injectEndpoints({
  endpoints: (build) => ({
    getLibraryOverview: build.query<LibraryOverviewDto, string>({
      query: (accountId) => ({ url: `${base(accountId)}/library/overview` }),
      providesTags: (_r, _e, accountId) => [tag(accountId, 'overview')],
    }),
    seedLibrary: build.mutation<SeedResultDto, Scoped<{ mode: 'skip' | 'replace' }>>({
      query: ({ accountId, mode }) => ({ url: `${base(accountId)}/library/seed`, method: 'POST', body: { mode } }),
      invalidatesTags: invalidate('categories', 'phrases', 'facts', 'diagnostics', 'playbooks'),
    }),
    copyLibrary: build.mutation<SeedResultDto, Scoped<{ sourceAccountId: string; body: CopyLibraryRequest }>>({
      query: ({ accountId, sourceAccountId, body }) => ({
        url: `${base(accountId)}/library/copy-from/${sourceAccountId}`,
        method: 'POST',
        body,
      }),
      invalidatesTags: invalidate('categories', 'phrases', 'facts', 'diagnostics', 'playbooks', 'notes'),
    }),
    previewSplit: build.mutation<PreviewSplitResponse, Scoped<{ text: string }>>({
      query: ({ accountId, text }) => ({ url: `${base(accountId)}/library/preview-split`, method: 'POST', body: { text } }),
    }),

    getCategories: build.query<CategoryDto[], string>({
      query: (accountId) => ({ url: `${base(accountId)}/categories` }),
      providesTags: (_r, _e, accountId) => [tag(accountId, 'categories')],
    }),
    createCategory: build.mutation<CategoryDto, Scoped<{ body: CategoryInput }>>({
      query: ({ accountId, body }) => ({ url: `${base(accountId)}/categories`, method: 'POST', body }),
      invalidatesTags: invalidate('categories'),
    }),
    updateCategory: build.mutation<CategoryDto, ItemArg<CategoryInput>>({
      query: ({ accountId, id, patch }) => ({ url: `${base(accountId)}/categories/${id}`, method: 'PUT', body: patch }),
      invalidatesTags: invalidate('categories'),
    }),
    deleteCategory: build.mutation<void, Scoped<{ id: string }>>({
      query: ({ accountId, id }) => ({ url: `${base(accountId)}/categories/${id}`, method: 'DELETE' }),
      invalidatesTags: invalidate('categories'),
    }),

    getPhrases: build.query<PhraseDto[], Scoped<{ query?: PhrasesQuery }>>({
      query: ({ accountId, query }) => ({ url: `${base(accountId)}/phrases`, params: query }),
      providesTags: (_r, _e, { accountId }) => [tag(accountId, 'phrases')],
    }),
    createPhrase: build.mutation<PhraseDto, Scoped<{ body: PhraseInput }>>({
      query: ({ accountId, body }) => ({ url: `${base(accountId)}/phrases`, method: 'POST', body }),
      invalidatesTags: invalidate('phrases'),
    }),
    updatePhrase: build.mutation<PhraseDto, ItemArg<PhraseInput>>({
      query: ({ accountId, id, patch }) => ({ url: `${base(accountId)}/phrases/${id}`, method: 'PUT', body: patch }),
      invalidatesTags: invalidate('phrases'),
    }),
    deletePhrase: build.mutation<void, Scoped<{ id: string }>>({
      query: ({ accountId, id }) => ({ url: `${base(accountId)}/phrases/${id}`, method: 'DELETE' }),
      invalidatesTags: invalidate('phrases'),
    }),

    getFacts: build.query<FactDto[], string>({
      query: (accountId) => ({ url: `${base(accountId)}/facts` }),
      providesTags: (_r, _e, accountId) => [tag(accountId, 'facts')],
    }),
    createFact: build.mutation<FactDto, Scoped<{ body: FactInput }>>({
      query: ({ accountId, body }) => ({ url: `${base(accountId)}/facts`, method: 'POST', body }),
      invalidatesTags: invalidate('facts'),
    }),
    updateFact: build.mutation<FactDto, ItemArg<FactInput>>({
      query: ({ accountId, id, patch }) => ({ url: `${base(accountId)}/facts/${id}`, method: 'PUT', body: patch }),
      invalidatesTags: invalidate('facts'),
    }),
    deleteFact: build.mutation<void, Scoped<{ id: string }>>({
      query: ({ accountId, id }) => ({ url: `${base(accountId)}/facts/${id}`, method: 'DELETE' }),
      invalidatesTags: invalidate('facts'),
    }),

    getDiagnostics: build.query<DiagnosticDto[], Scoped<{ query?: DiagnosticsQuery }>>({
      query: ({ accountId, query }) => ({ url: `${base(accountId)}/diagnostics`, params: query }),
      providesTags: (_r, _e, { accountId }) => [tag(accountId, 'diagnostics')],
    }),
    createDiagnostic: build.mutation<DiagnosticDto, Scoped<{ body: DiagnosticInput }>>({
      query: ({ accountId, body }) => ({ url: `${base(accountId)}/diagnostics`, method: 'POST', body }),
      invalidatesTags: invalidate('diagnostics'),
    }),
    updateDiagnostic: build.mutation<DiagnosticDto, ItemArg<DiagnosticInput>>({
      query: ({ accountId, id, patch }) => ({ url: `${base(accountId)}/diagnostics/${id}`, method: 'PUT', body: patch }),
      invalidatesTags: invalidate('diagnostics'),
    }),
    deleteDiagnostic: build.mutation<void, Scoped<{ id: string }>>({
      query: ({ accountId, id }) => ({ url: `${base(accountId)}/diagnostics/${id}`, method: 'DELETE' }),
      invalidatesTags: invalidate('diagnostics'),
    }),

    getPlaybooks: build.query<PlaybookDto[], string>({
      query: (accountId) => ({ url: `${base(accountId)}/playbooks` }),
      providesTags: (_r, _e, accountId) => [tag(accountId, 'playbooks')],
    }),
    updatePlaybook: build.mutation<PlaybookDto, Scoped<{ stage: FunnelStage; patch: PlaybookInput }>>({
      query: ({ accountId, stage, patch }) => ({ url: `${base(accountId)}/playbooks/${stage}`, method: 'PUT', body: patch }),
      invalidatesTags: invalidate('playbooks'),
    }),
    resetPlaybooks: build.mutation<PlaybookDto[], Scoped<{ stage?: FunnelStage }>>({
      query: ({ accountId, stage }) => ({
        url: `${base(accountId)}/playbooks/reset`,
        method: 'POST',
        body: stage ? { stage } : {},
      }),
      invalidatesTags: invalidate('playbooks'),
    }),

    getNotes: build.query<NoteDto[], string>({
      query: (accountId) => ({ url: `${base(accountId)}/notes` }),
      providesTags: (_r, _e, accountId) => [tag(accountId, 'notes')],
    }),
    createNote: build.mutation<NoteDto, Scoped<{ body: NoteInput }>>({
      query: ({ accountId, body }) => ({ url: `${base(accountId)}/notes`, method: 'POST', body }),
      invalidatesTags: invalidate('notes'),
    }),
    updateNote: build.mutation<NoteDto, ItemArg<NoteInput>>({
      query: ({ accountId, id, patch }) => ({ url: `${base(accountId)}/notes/${id}`, method: 'PUT', body: patch }),
      invalidatesTags: invalidate('notes'),
    }),
    deleteNote: build.mutation<void, Scoped<{ id: string }>>({
      query: ({ accountId, id }) => ({ url: `${base(accountId)}/notes/${id}`, method: 'DELETE' }),
      invalidatesTags: invalidate('notes'),
    }),
  }),
})

export const {
  useGetLibraryOverviewQuery,
  useSeedLibraryMutation,
  useCopyLibraryMutation,
  usePreviewSplitMutation,
  useGetCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useGetPhrasesQuery,
  useCreatePhraseMutation,
  useUpdatePhraseMutation,
  useDeletePhraseMutation,
  useGetFactsQuery,
  useCreateFactMutation,
  useUpdateFactMutation,
  useDeleteFactMutation,
  useGetDiagnosticsQuery,
  useCreateDiagnosticMutation,
  useUpdateDiagnosticMutation,
  useDeleteDiagnosticMutation,
  useGetPlaybooksQuery,
  useUpdatePlaybookMutation,
  useResetPlaybooksMutation,
  useGetNotesQuery,
  useCreateNoteMutation,
  useUpdateNoteMutation,
  useDeleteNoteMutation,
} = libraryApi
