import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { API_URL } from '@/shared/config'
import { getAuthToken } from './authToken'

/**
 * Единственный createApi на приложение: слайсы добавляют свои эндпоинты
 * через baseApi.injectEndpoints, чтобы не плодить reducerPath и middleware.
 */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: API_URL,
    prepareHeaders: (headers) => {
      const token = getAuthToken()
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      return headers
    },
  }),
  endpoints: () => ({}),
})
