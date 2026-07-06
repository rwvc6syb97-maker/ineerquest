/**
 * 第二层（管理区）：运营后台布局
 * -------------------------------------------------------------
 * - 左侧固定侧栏：导航项按 hasPerm 权限点显隐（前端级 UI 隐藏，最终以后端为准）。
 * - 顶部 header：展示当前管理员昵称 + 登出。
 * - 页面刷新时调用 hydrate 从本地 perms 恢复登录态（无 profile 接口的兜底）。
 * 权限点对齐后端 ops 各 controller 的 @RequirePermission。
 */
import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAdminAuthStore } from '../stores/adminAuth.store';
import { Toaster } from '../pages/admin/_shared';

interface NavItem {
  to: string;
  label: string;
  /** 所需权限点（任一命中即显示） */
  perm: string;
}

// 导航项与后端 controller 权限点对齐
const NAV_ITEMS: NavItem[] = [
  { to: '/admin/analytics', label: '数据看板', perm: 'analytics:read' },
  { to: '/admin/questions', label: '题库管理', perm: 'question:read' },
  { to: '/admin/users', label: '用户管理', perm: 'user:read' },
  { to: '/admin/plans', label: '套餐管理', perm: 'membership:plan:manage' },
  { to: '/admin/activation-codes', label: '激活码', perm: 'payment:manage' },
  { to: '/admin/coaches', label: '辅导师管理', perm: 'coach:audit' },
  { to: '/admin/content', label: '内容管理', perm: 'career:read' },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const admin = useAdminAuthStore((s) => s.admin);
  const hydrate = useAdminAuthStore((s) => s.hydrate);
  const hasPerm = useAdminAuthStore((s) => s.hasPerm);
  const logout = useAdminAuthStore((s) => s.logout);

  // 刷新后恢复登录态
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const onLogout = async () => {
    await logout();
    navigate('/admin/login', { replace: true });
  };

  const visibleItems = NAV_ITEMS.filter((item) => hasPerm(item.perm));

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* 侧栏 */}
      <aside className="flex w-56 shrink-0 flex-col bg-slate-900 text-slate-200">
        <div className="border-b border-slate-800 px-5 py-4 text-base font-bold text-white">
          InnerQuest 运营后台
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {visibleItems.length === 0 ? (
            <p className="px-2 py-4 text-xs text-slate-500">
              当前账号无任何后台权限
            </p>
          ) : (
            visibleItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                      ? 'bg-blue-600 font-medium text-white'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))
          )}
        </nav>
      </aside>

      {/* 主区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <span className="text-sm text-slate-500">运营管理后台</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-700">
              {admin?.nickname || admin?.adminRole || '管理员'}
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              退出登录
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-auto px-6 py-6">
          <Outlet />
        </main>
      </div>

      {/* 全局轻提示 */}
      <Toaster />
    </div>
  );
}