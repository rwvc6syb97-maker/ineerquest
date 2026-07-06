/**
 * 路由守卫：要求已登录
 * 未登录时跳转登录页，并携带回跳地址（redirect）。
 */
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthStore } from '../../stores/auth.store';

export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const authed = useAuthStore((s) => s.isAuthenticated)();

  if (!authed) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth/login?redirect=${redirect}`} replace />;
  }
  return <>{children}</>;
}