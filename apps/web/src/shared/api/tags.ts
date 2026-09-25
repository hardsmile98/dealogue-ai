/**
 * Реестр тегов кэша RTK Query.
 *
 * На приложение один `createApi` (см. baseApi), поэтому пространство тегов —
 * общее: два слайса не могут завести тег с одним именем и разным смыслом.
 * Это знание принадлежит shared, а не отдельной сущности: так сущности не
 * импортируют теги друг у друга вбок.
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

/** Настройки агента на аккаунте вместе со счётчиками библиотеки (id = accountId). */
export const BOT_SETTINGS_TAG = 'BotSettings' as const
/** Состояние агента в чате (id = chatId). */
export const BOT_CHAT_TAG = 'BotChat' as const
/** Сессии песочницы агента: список (id = accountId) и одна сессия (id = sessionId). */
export const BOT_SANDBOX_TAG = 'BotSandbox' as const
/** Библиотека агента (id = accountId). */
export const BOT_LIBRARY_TAG = 'BotLibrary' as const
/** Примеры диалогов агента (id = accountId). */
export const BOT_EXAMPLES_TAG = 'BotExamples' as const
