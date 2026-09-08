import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { HomePage } from '@/pages/home'
import { LoginPage } from '@/pages/login'
import { NotFoundPage } from '@/pages/not-found'
import { ROUTES } from '@/shared/config'
import { GuestRoute } from './GuestRoute'
import { ProtectedRoute } from './ProtectedRoute'

const router = createBrowserRouter([
  {
    element: <GuestRoute />,
    children: [{ path: ROUTES.login, element: <LoginPage /> }],
  },
  {
    element: <ProtectedRoute />,
    children: [{ path: ROUTES.home, element: <HomePage /> }],
  },
  { path: '*', element: <NotFoundPage /> },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
