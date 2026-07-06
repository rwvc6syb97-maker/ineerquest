/**
 * 路由守卫：要求后台管理员已登录（scope=admin）
 * -------------------------------------------------------------
 * - 未登录（无 admin token）→ 跳 /admin/login，携带回跳地址。
 * - 已登录但缺少所需权限点（need）→ 展示「无权限访问」占位，不跳走
 *   （避免误伤，最终以后端 403 为准）。
 * 权限判断复用 useAdminAuthStore.hasPerm（对齐后端 RBAC 通配规则）。
 */
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAdminAuthStore } from '../../stores/adminAuth.store';

export function RequireAdmin({
  children,
  need,
}: {
  children: ReactNode;
  /** 访问该路由所需的权限点（省略则仅校验登录态） */
  need?: string;
}) {
  const location = useLocation();
  const authed = useAdminAuthStore((s) => s.isAuthenticated)();
  const hasPerm = useAdminAuthStore((s) => s.hasPerm);

  if (!authed) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/admin/login?redirect=${redirect}`} replace />;
  }

  if (need && !hasPerm(need)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
        <div className="text-4xl">🔒</div>
        <h2 className="text-lg font-semibold text-slate-800">无权限访问</h2>
        <p className="max-w-sm text-sm text-slate-500">
          当前账号缺少权限点「{need}」，如需访问请联系超级管理员分配角色。
        </p>
      </div>
    );
  }

  return <>{children}</>;
}