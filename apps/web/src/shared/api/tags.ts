/**
 * Реестр тегов кэша RTK Query.
 *
 * На приложение один `createApi` (см. baseApi), поэтому пространство тегов —
 * общее: два слайса не могут завести тег с одним именем и разным смыслом.
 * Это знание принадлежит shared, а не отдельной сущности: так сущности не
 * импортируют теги друг у друга вбок.
 *
 * `id` у тега — то, что делает кэш адресуемым. У каждого тега он один по
 * смыслу (accountId, chatId или sessionId), поэтому список и одна запись —
 * разные теги, а не один тег с id вида `list-…`.
 */

/** Аккаунт (id = accountId) и список аккаунтов (id = `LIST`). */
export const TELEGRAM_ACCOUNT_TAG = 'TelegramAccount' as const;
/** Статистика аккаунта (id = accountId). */
export const ACCOUNT_STATS_TAG = 'AccountStats' as const;

/** Список диалогов аккаунта (id = accountId). */
export const CHAT_LIST_TAG = 'ChatList' as const;
/** Один диалог (id = chatId). */
export const CHAT_TAG = 'Chat' as const;
/** Переписка одного диалога (id = chatId). */
export const MESSAGE_TAG = 'Message' as const;

/** Настройки агента на аккаунте вместе со счётчиками библиотеки (id = accountId). */
export const BOT_SETTINGS_TAG = 'BotSettings' as const;
/** Состояние и журнал агента в чате (id = chatId). */
export const BOT_CHAT_TAG = 'BotChat' as const;
/** Чаты «у менеджера» (id = accountId). */
export const BOT_HANDOFFS_TAG = 'BotHandoffs' as const;
/** Список сессий песочницы (id = accountId). */
export const BOT_SANDBOX_LIST_TAG = 'BotSandboxList' as const;
/** Одна сессия песочницы (id = sessionId). */
export const BOT_SANDBOX_TAG = 'BotSandbox' as const;
/** Библиотека агента (id = accountId). */
export const BOT_LIBRARY_TAG = 'BotLibrary' as const;
/** Примеры диалогов агента (id = accountId). */
export const BOT_EXAMPLES_TAG = 'BotExamples' as const;

/** Все теги — для `createApi({ tagTypes })`. */
export const TAG_TYPES = [
  TELEGRAM_ACCOUNT_TAG,
  ACCOUNT_STATS_TAG,
  CHAT_LIST_TAG,
  CHAT_TAG,
  MESSAGE_TAG,
  BOT_SETTINGS_TAG,
  BOT_CHAT_TAG,
  BOT_HANDOFFS_TAG,
  BOT_SANDBOX_LIST_TAG,
  BOT_SANDBOX_TAG,
  BOT_LIBRARY_TAG,
  BOT_EXAMPLES_TAG,
] as const;
