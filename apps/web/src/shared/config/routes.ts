/**
 * Пути приложения. Живут в shared, чтобы на них могли ссылаться и роутер
 * из слоя app, и любые ссылки на страницах, не нарушая порядок слоёв FSD.
 */
export const ROUTES = {
  home: '/',
  login: '/login',
} as const

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES]
