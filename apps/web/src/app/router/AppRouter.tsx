import { lazy } from 'react'
import { Navigate, createBrowserRouter, RouterProvider } from 'react-router-dom'
import { LoginPage } from '@/pages/login'
import { NotFoundPage } from '@/pages/not-found'
import { ROUTES } from '@/shared/config'
import { RealtimeProvider } from '@/features/realtime'
import { AppShell } from '@/widgets/app-shell'
import { GuestRoute } from './GuestRoute'
import { ProtectedRoute } from './ProtectedRoute'

/**
 * Разделы за логином грузятся своими чанками: первый экран — это форма входа,
 * тянуть ради неё графики и переписку незачем. Заглушку на время загрузки
 * показывает `Suspense` внутри AppShell.
 */
const AccountsPage = lazy(async () => ({ default: (await import('@/pages/accounts')).AccountsPage }))
const AccountPage = lazy(async () => ({ default: (await import('@/pages/account')).AccountPage }))
const AccountStatsPage = lazy(async () => ({
  default: (await import('@/pages/account')).AccountStatsPage,
}))
const AccountChatsPage = lazy(async () => ({
  default: (await import('@/pages/account')).AccountChatsPage,
}))

const router = createBrowserRouter([
  {
    element: <GuestRoute />,
    children: [{ path: ROUTES.login, element: <LoginPage /> }],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        // Живые события (SSE) нужны всей авторизованной части: обновление чатов.
        element: (
          <RealtimeProvider>
            <AppShell />
          </RealtimeProvider>
        ),
        children: [
          { path: ROUTES.home, element: <Navigate to={ROUTES.accounts} replace /> },
          { path: ROUTES.accounts, element: <AccountsPage /> },
          {
            path: ROUTES.account,
            element: <AccountPage />,
            children: [
              { index: true, element: <Navigate to="stats" replace /> },
              { path: 'stats', element: <AccountStatsPage /> },
              { path: 'chats', element: <AccountChatsPage /> },
              { path: 'chats/:chatId', element: <AccountChatsPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
