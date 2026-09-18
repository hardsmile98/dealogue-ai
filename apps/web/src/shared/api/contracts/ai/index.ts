/**
 * Контракт backend-API ИИ-агента — зеркало apps/api/src/ai. Менять синхронно.
 * Разбит по темам; ниже — единая точка входа для shared/api.
 *
 * Все даты — ISO-строки; дни статистики — `YYYY-MM-DD`.
 */

export * from './common'
export * from './settings'
export * from './library'
export * from './drafts'
export * from './chat'
export * from './stats'
