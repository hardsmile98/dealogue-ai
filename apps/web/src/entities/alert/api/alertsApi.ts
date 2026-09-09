import { baseApi } from '@/shared/api'
import type { AlertDto, AlertsCountDto, AlertsQuery } from '@/shared/api'

export const ALERT_TAG = 'Alert' as const

export const alertsApi = baseApi.enhanceEndpoints({ addTagTypes: [ALERT_TAG] }).injectEndpoints({
  endpoints: (build) => ({
    getAlerts: build.query<AlertDto[], AlertsQuery | void>({
      query: (query) => ({ url: '/alerts', params: query ?? undefined }),
      providesTags: (alerts) => [
        { type: ALERT_TAG, id: 'LIST' },
        ...(alerts ?? []).map(({ id }) => ({ type: ALERT_TAG, id })),
      ],
    }),

    getAlertsCount: build.query<AlertsCountDto, void>({
      query: () => ({ url: '/alerts/count' }),
      providesTags: [{ type: ALERT_TAG, id: 'COUNT' }],
    }),

    ackAlert: build.mutation<AlertDto, string>({
      query: (id) => ({ url: `/alerts/${id}/ack`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => [
        { type: ALERT_TAG, id },
        { type: ALERT_TAG, id: 'LIST' },
        { type: ALERT_TAG, id: 'COUNT' },
      ],
    }),

    resolveAlert: build.mutation<AlertDto, string>({
      query: (id) => ({ url: `/alerts/${id}/resolve`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => [
        { type: ALERT_TAG, id },
        { type: ALERT_TAG, id: 'LIST' },
        { type: ALERT_TAG, id: 'COUNT' },
      ],
    }),
  }),
})

export const { useGetAlertsQuery, useGetAlertsCountQuery, useAckAlertMutation, useResolveAlertMutation } =
  alertsApi
