import { AI_STATS_TAG, baseApi } from '@/shared/api'
import type { DraftStatsDto, FunnelStatsDto, LibraryStatsDto, StatsQuery, TurnStatsDto } from '@/shared/api'

/** Статистика аккаунта: воронка, касания и тексты, черновики, ходы. */
export const statsApi = baseApi.enhanceEndpoints({ addTagTypes: [AI_STATS_TAG] }).injectEndpoints({
  endpoints: (build) => ({
    getFunnelStats: build.query<FunnelStatsDto, StatsQuery>({
      query: ({ accountId, ...params }) => ({ url: `/telegram/accounts/${accountId}/ai/stats/funnel`, params }),
      providesTags: (_r, _e, { accountId }) => [{ type: AI_STATS_TAG, id: `funnel:${accountId}` }],
    }),
    getTurnStats: build.query<TurnStatsDto, StatsQuery>({
      query: ({ accountId, ...params }) => ({ url: `/telegram/accounts/${accountId}/ai/stats/turns`, params }),
      providesTags: (_r, _e, { accountId }) => [{ type: AI_STATS_TAG, id: `turns:${accountId}` }],
    }),
    getDraftStats: build.query<DraftStatsDto, StatsQuery>({
      query: ({ accountId, ...params }) => ({ url: `/telegram/accounts/${accountId}/ai/stats/drafts`, params }),
      providesTags: (_r, _e, { accountId }) => [{ type: AI_STATS_TAG, id: `drafts:${accountId}` }],
    }),
    getLibraryStats: build.query<LibraryStatsDto, StatsQuery>({
      query: ({ accountId, ...params }) => ({ url: `/telegram/accounts/${accountId}/ai/stats/phrases`, params }),
      providesTags: (_r, _e, { accountId }) => [{ type: AI_STATS_TAG, id: `phrases:${accountId}` }],
    }),
  }),
})

export const { useGetFunnelStatsQuery, useGetTurnStatsQuery, useGetDraftStatsQuery, useGetLibraryStatsQuery } = statsApi
