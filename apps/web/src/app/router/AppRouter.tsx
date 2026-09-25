import { lazy } from 'react';
import type { ComponentType } from 'react';
import {
  Navigate,
  RouterProvider,
  createBrowserRouter,
} from 'react-router-dom';
import { ROUTES } from '@/shared/config';
import { LoginPage } from '@/pages/login';
import { NotFoundPage } from '@/pages/not-found';
import { RealtimeProvider } from '@/features/realtime';
import { AppShell } from '@/widgets/app-shell';
import { GuestRoute } from './GuestRoute';
import { ProtectedRoute } from './ProtectedRoute';

/** `lazy` для именованного экспорта страницы: `lazyPage(() => import(…), 'Name')`. */
function lazyPage<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(async () => ({
    default: (await load())[name] as ComponentType,
  }));
}

/*
 * Разделы за логином грузятся своими чанками: первый экран — это форма
 * входа, тянуть ради неё графики и переписку незачем. Каждая вкладка
 * аккаунта — отдельная страница и отдельный чанк: открывшему «Чаты» не
 * нужны ни график статистики, ни формы агента. Заглушку на время загрузки
 * показывает `Suspense` внутри AppShell.
 */
const AccountsPage = lazyPage(() => import('@/pages/accounts'), 'AccountsPage');
const AccountPage = lazyPage(() => import('@/pages/account'), 'AccountPage');
const AccountStatsPage = lazyPage(
  () => import('@/pages/account-stats'),
  'AccountStatsPage',
);
const AccountChatsPage = lazyPage(
  () => import('@/pages/account-chats'),
  'AccountChatsPage',
);
const AccountHandoffsPage = lazyPage(
  () => import('@/pages/account-handoffs'),
  'AccountHandoffsPage',
);
const AccountBotPage = lazyPage(
  () => import('@/pages/account-bot'),
  'AccountBotPage',
);
const AccountSandboxPage = lazyPage(
  () => import('@/pages/account-sandbox'),
  'AccountSandboxPage',
);

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
          {
            path: ROUTES.home,
            element: <Navigate to={ROUTES.accounts} replace />,
          },
          { path: ROUTES.accounts, element: <AccountsPage /> },
          {
            path: ROUTES.account,
            element: <AccountPage />,
            children: [
              { index: true, element: <Navigate to="stats" replace /> },
              { path: 'stats', element: <AccountStatsPage /> },
              { path: 'chats', element: <AccountChatsPage /> },
              { path: 'chats/:chatId', element: <AccountChatsPage /> },
              { path: 'handoffs', element: <AccountHandoffsPage /> },
              { path: 'bot', element: <AccountBotPage /> },
              { path: 'sandbox', element: <AccountSandboxPage /> },
              { path: 'sandbox/:sessionId', element: <AccountSandboxPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
