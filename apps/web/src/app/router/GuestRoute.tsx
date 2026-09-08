import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useIsAuthenticated } from '@/entities/session'
import { ROUTES } from '@/shared/config'

interface RedirectState {
  from?: string
}

/**
 * Обратная сторона ProtectedRoute: авторизованному на /login делать нечего.
 * Именно этот редирект уводит пользователя со страницы входа после логина.
 */
export function GuestRoute() {
  const isAuthenticated = useIsAuthenticated()

  const location = useLocation()

  if (isAuthenticated) {
    const state = location.state as RedirectState | null
  
    return <Navigate to={state?.from ?? ROUTES.home} replace />
  }

  return <Outlet />
}
