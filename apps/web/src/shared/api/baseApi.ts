import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from '@reduxjs/toolkit/query';
import { API_URL } from '@/shared/config';
import { unauthorized } from './authEvents';
import { getAuthToken } from './authToken';
import { TAG_TYPES } from './tags';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  prepareHeaders: (headers) => {
    const token = getAuthToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

/**
 * Единая реакция на протухший токен: любой 401 по запросу, который уходил
 * с Authorization, означает, что сессии больше нет. Без этого приложение
 * оставалось «залогиненным» и молча собирало 401 на каждом экране.
 *
 * Проверка «токен вообще отправлялся» отсекает два ложных срабатывания:
 * 401 на /auth/login при неверном пароле и ответы запросов, которые
 * стартовали до разлогина и вернулись уже после него.
 */
const baseQueryWithAuthGuard: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const hadToken = getAuthToken() !== null;
  const result = await rawBaseQuery(args, api, extraOptions);

  if (hadToken && result.error?.status === 401) {
    api.dispatch(unauthorized());
  }

  return result;
};

/**
 * Единственный createApi на приложение: слайсы добавляют свои эндпоинты
 * через baseApi.injectEndpoints, чтобы не плодить reducerPath и middleware.
 * Теги объявлены здесь все сразу (реестр — tags.ts), поэтому слайсам не
 * нужен `enhanceEndpoints({ addTagTypes })`.
 */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuthGuard,
  tagTypes: TAG_TYPES,
  endpoints: () => ({}),
});
