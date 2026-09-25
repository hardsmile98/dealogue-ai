import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useIsAuthenticated, useSessionExpiry } from '@/entities/session';
import { ROUTES } from '@/shared/config';

/** Пускает дальше только авторизованных, запоминая, куда пользователь шёл. */
export function ProtectedRoute() {
  const isAuthenticated = useIsAuthenticated();
  // Следим за сроком токена, пока пользователь внутри приложения.
  useSessionExpiry();

  const location = useLocation();

  if (!isAuthenticated) {
    return (
      <Navigate to={ROUTES.login} replace state={{ from: location.pathname }} />
    );
  }

  return <Outlet />;
}
