import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';

// 第二层（应用区）：登录后主工作区，带侧边导航
const navItems = [
  { to: '/app', label: '个人中心', end: true },
  { to: '/app/report/history', label: '我的报告' },
  { to: '/app/career', label: '职业规划' },
  { to: '/app/coaching', label: 'AI 对话', end: true },
  { to: '/app/coaching/coaches', label: '辅导师' },
  { to: '/app/coaching/orders', label: '我的辅导' },
  { to: '/app/me/favorites', label: '我的收藏' },
  { to: '/app/me/plan', label: '成长计划' },
  { to: '/app/settings', label: '账户设置' },
];

export function AppLayout() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* 桌面端侧边导航 */}
      <aside className="hidden w-56 border-r bg-white p-4 md:block">
        <nav className="flex flex-col gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded px-3 py-2 text-sm ${isActive ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* 移动端顶部导航栏 */}
      <header className="sticky top-0 z-40 border-b bg-white px-4 py-3 md:hidden">
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold text-slate-800">个人中心</span>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
            aria-label={open ? '关闭菜单' : '打开菜单'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? (
                <>
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </>
              ) : (
                <>
                  <line x1="4" y1="7" x2="20" y2="7" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="17" x2="20" y2="17" />
                </>
              )}
            </svg>
          </button>
        </div>

        {/* 移动端抽屉菜单 */}
        {open && (
          <nav className="mt-3 flex flex-col gap-1 border-t border-slate-100 pt-3">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2.5 text-sm ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {/* 主内容区 */}
      <main className="flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
