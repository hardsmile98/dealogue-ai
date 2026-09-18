import { AI_LIBRARY_TAG, baseApi } from '@/shared/api'
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

/** Аргумент любого запроса библиотеки: она всегда принадлежит аккаунту. */
type Scoped<T = unknown> = { accountId: string } & T
type ListArg<Q> = Scoped<{ query?: Q }>
type ItemArg<T> = Scoped<{ id: string; patch: Partial<T> }>

const base = (accountId: string) => `/telegram/accounts/${accountId}/ai`

/** Тег раздела библиотеки: «фразы аккаунта 42» — отдельный кэш от «фактов». */
const tag = (accountId: string, section: string) => ({
  type: AI_LIBRARY_TAG,
  id: `${section}:${accountId}`,
})

/**
 * Правка любого раздела устаревает и сам раздел, и сводку по библиотеке —
 * в ней считаются заполненность и недостающие блоки.
 */
const invalidate =
  (...sections: string[]) =>
  (_result: unknown, _error: unknown, arg: Scoped) => [
    ...sections.map((section) => tag(arg.accountId, section)),
    tag(arg.accountId, 'overview'),
  ]

export const libraryApi = baseApi.enhanceEndpoints({ addTagTypes: [AI_LIBRARY_TAG] }).injectEndpoints({
  endpoints: (build) => {
    /**
     * Разделы библиотеки различаются только адресом и типами, поэтому четыре
     * их эндпоинта собираются здесь, а не переписываются пять раз подряд.
     * `build` берётся из замыкания, так что типы выводятся как у обычных
     * определений.
     */
    const crud = <Dto, Input, Query = never>(section: string) => ({
      list: build.query<Dto[], ListArg<Query>>({
        // Фильтры разделов — плоские объекты из строк; приведение нужно только
        // потому, что `Query` здесь параметр типа, а не конкретный контракт.
        query: ({ accountId, query }) => ({
          url: `${base(accountId)}/${section}`,
          params: query as Record<string, unknown> | undefined,
        }),
        providesTags: (_result, _error, { accountId }) => [tag(accountId, section)],
      }),
      create: build.mutation<Dto, Scoped<{ body: Input }>>({
        query: ({ accountId, body }) => ({ url: `${base(accountId)}/${section}`, method: 'POST', body }),
        invalidatesTags: invalidate(section),
      }),
      update: build.mutation<Dto, ItemArg<Input>>({
        query: ({ accountId, id, patch }) => ({
          url: `${base(accountId)}/${section}/${id}`,
          method: 'PUT',
          body: patch,
        }),
        invalidatesTags: invalidate(section),
      }),
      remove: build.mutation<void, Scoped<{ id: string }>>({
        query: ({ accountId, id }) => ({ url: `${base(accountId)}/${section}/${id}`, method: 'DELETE' }),
        invalidatesTags: invalidate(section),
      }),
    })

    const categories = crud<CategoryDto, CategoryInput>('categories')
    const phrases = crud<PhraseDto, PhraseInput, PhrasesQuery>('phrases')
    const facts = crud<FactDto, FactInput>('facts')
    const diagnostics = crud<DiagnosticDto, DiagnosticInput, DiagnosticsQuery>('diagnostics')
    const notes = crud<NoteDto, NoteInput>('notes')

    return {
      getLibraryOverview: build.query<LibraryOverviewDto, string>({
        query: (accountId) => ({ url: `${base(accountId)}/library/overview` }),
        providesTags: (_result, _error, accountId) => [tag(accountId, 'overview')],
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
        query: ({ accountId, text }) => ({
          url: `${base(accountId)}/library/preview-split`,
          method: 'POST',
          body: { text },
        }),
      }),

      getCategories: categories.list,
      createCategory: categories.create,
      updateCategory: categories.update,
      deleteCategory: categories.remove,

      getPhrases: phrases.list,
      createPhrase: phrases.create,
      updatePhrase: phrases.update,
      deletePhrase: phrases.remove,

      getFacts: facts.list,
      createFact: facts.create,
      updateFact: facts.update,
      deleteFact: facts.remove,

      getDiagnostics: diagnostics.list,
      createDiagnostic: diagnostics.create,
      updateDiagnostic: diagnostics.update,
      deleteDiagnostic: diagnostics.remove,

      getNotes: notes.list,
      createNote: notes.create,
      updateNote: notes.update,
      deleteNote: notes.remove,

      // Плейбуки не создаются и не удаляются: они заданы этапами воронки.
      getPlaybooks: build.query<PlaybookDto[], string>({
        query: (accountId) => ({ url: `${base(accountId)}/playbooks` }),
        providesTags: (_result, _error, accountId) => [tag(accountId, 'playbooks')],
      }),
      updatePlaybook: build.mutation<PlaybookDto, Scoped<{ stage: FunnelStage; patch: PlaybookInput }>>({
        query: ({ accountId, stage, patch }) => ({
          url: `${base(accountId)}/playbooks/${stage}`,
          method: 'PUT',
          body: patch,
        }),
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
    }
  },
})

export const {
  useCopyLibraryMutation,
  useCreateCategoryMutation,
  useCreateDiagnosticMutation,
  useCreateFactMutation,
  useCreateNoteMutation,
  useCreatePhraseMutation,
  useDeleteCategoryMutation,
  useDeleteDiagnosticMutation,
  useDeleteFactMutation,
  useDeleteNoteMutation,
  useDeletePhraseMutation,
  useGetCategoriesQuery,
  useGetDiagnosticsQuery,
  useGetFactsQuery,
  useGetLibraryOverviewQuery,
  useGetNotesQuery,
  useGetPhrasesQuery,
  useGetPlaybooksQuery,
  usePreviewSplitMutation,
  useResetPlaybooksMutation,
  useSeedLibraryMutation,
  useUpdateCategoryMutation,
  useUpdateDiagnosticMutation,
  useUpdateFactMutation,
  useUpdateNoteMutation,
  useUpdatePhraseMutation,
  useUpdatePlaybookMutation,
} = libraryApi
