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
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r bg-white p-4">
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
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}