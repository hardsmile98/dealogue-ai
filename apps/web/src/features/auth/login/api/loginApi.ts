import { baseApi } from '@/shared/api'
import { IS_MOCK_API } from '@/shared/config'
import type { Session } from '@/entities/session'
import type { Credentials } from '../model/types'
import { mockLogin } from './mockLogin'

export const loginApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    login: build.mutation<Session, Credentials>({
      queryFn: async (credentials, _api, _extraOptions, baseQuery) => {
        if (IS_MOCK_API) {
          return mockLogin(credentials)
        }

        const result = await baseQuery({
          url: '/auth/login',
          method: 'POST',
          body: {
            login: credentials.login.trim(),
            password: credentials.password,
          },
        })

        if (result.error) {
          return { error: result.error }
        }

        return { data: result.data as Session }
      },
    }),
  }),
})

export const { useLoginMutation } = loginApi
