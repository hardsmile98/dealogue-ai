/**
 * Реестр тегов кэша RTK Query.
 *
 * На приложение один `createApi` (см. baseApi), поэтому пространство тегов —
 * общее: два слайса не могут завести тег с одним именем и разным смыслом.
 * Это знание принадлежит shared, а не отдельной сущности. Пока теги лежали
 * по сущностям, `ai-draft` импортировал `ai-agent`, а `ai-stats` — `ai-draft`,
 * то есть слой ходил сам в себя вбок; здесь этой связи нет.
 *
 * `id` у тега — то, что делает кэш адресуемым: обычно accountId или chatId,
 * иногда служебные `LIST` / `COUNT` / `ALL`.
 */

export const TELEGRAM_ACCOUNT_TAG = 'TelegramAccount' as const
export const ACCOUNT_STATS_TAG = 'AccountStats' as const

/** Список диалогов аккаунта (id = accountId). */
export const CHAT_TAG = 'Chat' as const
/** Переписка одного диалога (id = chatId). */
export const MESSAGE_TAG = 'Message' as const

export const ALERT_TAG = 'Alert' as const

export const AI_SETTINGS_TAG = 'AiSettings' as const
export const AI_HEALTH_TAG = 'AiHealth' as const
/** Состояние одного чата (id = chatId) и сводка по аккаунту (id = accountId). */
export const AI_CHAT_TAG = 'AiChat' as const
/** Журнал ходов чата (id = chatId). */
export const AI_TURNS_TAG = 'AiTurns' as const
export const AI_OVERVIEW_TAG = 'AiOverview' as const
/** Очередь черновиков: id = accountId либо 'ALL' — по всем аккаунтам. */
export const AI_DRAFT_TAG = 'AiDraft' as const
/** Разделы библиотеки: id = `<раздел>:<accountId>`. */
export const AI_LIBRARY_TAG = 'AiLibrary' as const
/** Статистика агента: id = `<срез>:<accountId>`. */
export const AI_STATS_TAG = 'AiStats' as const
