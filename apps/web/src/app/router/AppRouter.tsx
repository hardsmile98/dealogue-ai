import { Navigate, createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AccountAiPage, AccountChatsPage, AccountPage, AccountStatsPage } from '@/pages/account'
import { AccountsPage } from '@/pages/accounts'
import { AttentionPage } from '@/pages/attention'
import { LoginPage } from '@/pages/login'
import { NotFoundPage } from '@/pages/not-found'
import { ROUTES } from '@/shared/config'
import { RealtimeProvider } from '@/features/realtime'
import { AppShell } from '@/widgets/app-shell'
import { GuestRoute } from './GuestRoute'
import { ProtectedRoute } from './ProtectedRoute'

const router = createBrowserRouter([
  {
    element: <GuestRoute />,
    children: [{ path: ROUTES.login, element: <LoginPage /> }],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        // Живые события (SSE) нужны всей авторизованной части: бейдж алертов, обновление чатов.
        element: (
          <RealtimeProvider>
            <AppShell />
          </RealtimeProvider>
        ),
        children: [
          { path: ROUTES.home, element: <Navigate to={ROUTES.accounts} replace /> },
          { path: ROUTES.accounts, element: <AccountsPage /> },
          { path: ROUTES.attention, element: <AttentionPage /> },
          {
            path: ROUTES.account,
            element: <AccountPage />,
            children: [
              { index: true, element: <Navigate to="stats" replace /> },
              { path: 'stats', element: <AccountStatsPage /> },
              { path: 'chats', element: <AccountChatsPage /> },
              { path: 'chats/:chatId', element: <AccountChatsPage /> },
              { path: 'ai', element: <AccountAiPage /> },
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
