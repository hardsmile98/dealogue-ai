/**
 * Пути приложения. Живут в shared, чтобы на них могли ссылаться и роутер
 * из слоя app, и любые ссылки на страницах, не нарушая порядок слоёв FSD.
 */
export const ROUTES = {
  home: '/',
  login: '/login',
  accounts: '/accounts',
  /** Шаблоны для роутера: сегменты `:accountId` / `:chatId` подставляет React Router. */
  account: '/accounts/:accountId',
  accountStats: '/accounts/:accountId/stats',
  accountChats: '/accounts/:accountId/chats',
  accountChat: '/accounts/:accountId/chats/:chatId',
  accountAi: '/accounts/:accountId/ai',
  /** Чаты, где ИИ довёл клиента до оплаты или просит подключить менеджера. */
  attention: '/attention',
} as const

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES]

/** Готовые ссылки на страницы аккаунта — чтобы не собирать пути руками. */
export const accountLinks = {
  root: (accountId: string) => `${ROUTES.accounts}/${accountId}`,
  stats: (accountId: string) => `${ROUTES.accounts}/${accountId}/stats`,
  chats: (accountId: string) => `${ROUTES.accounts}/${accountId}/chats`,
  chat: (accountId: string, chatId: string) =>
    `${ROUTES.accounts}/${accountId}/chats/${chatId}`,
  ai: (accountId: string) => `${ROUTES.accounts}/${accountId}/ai`,
}
