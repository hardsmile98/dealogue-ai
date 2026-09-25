import { createAction } from '@reduxjs/toolkit';

/**
 * Сервер ответил 401 на запрос с токеном — токен истёк или отозван.
 *
 * Событие живёт в shared, потому что первым о протухшей сессии узнаёт
 * baseQuery, а импортировать entities снизу вверх нельзя. Слушают его
 * entities/session (сброс сессии и хранилища) — см. model/lifecycle.ts.
 */
export const unauthorized = createAction('auth/unauthorized');
