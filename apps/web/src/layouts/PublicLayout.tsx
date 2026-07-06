import { useState } from 'react';
import { Outlet, NavLink, Link } from 'react-router-dom';
import { Logo, Footer, SpringLink, type FooterColumn } from '../components';
import { useAuthStore } from '../stores/auth.store';

/**
 * 第二层（公开区）：营销 / 落地页 / 公开内容布局
 * -------------------------------------------------------------
 * - 顶部 sticky 玻璃导航栏：半透明 + backdrop-blur，左 Logo，右导航 + CTA。
 * - 移动端导航折叠为汉堡菜单（useState 展开）。
 * - 底部接入 Footer（按实际路由传 columns）。
 * - 保持 Outlet 主内容居中约束（max-w-5xl），不破坏现有页面（营销页可自行 -mx 突破）。
 */

const NAV_LINKS = [
  { to: '/', label: '首页', end: true },
  { to: '/personality-types', label: '人格类型', end: false },
  { to: '/pricing', label: '价格', end: false },
  { to: '/about', label: '关于', end: false },
];

// 页脚分栏：链接对齐当前真实路由
const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: '产品',
    links: [
      { label: '开始测评', to: '/assessment' },
      { label: '人格类型库', to: '/personality-types' },
      { label: '价格方案', to: '/pricing' },
    ],
  },
  {
    title: '法务',
    links: [
      { label: '隐私政策', to: '/legal/privacy' },
      { label: '服务条款', to: '/legal/terms' },
    ],
  },
  {
    title: '关于',
    links: [{ label: '关于我们', to: '/about'}],
  },
];

export function PublicLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const user = useAuthStore((s) => s.user);
  // 已登录时展示昵称首字或“个人中心”文案
  const accountLabel = user?.nickname ? user.nickname.charAt(0) : '个人中心';

  const linkClass = (isActive: boolean) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? 'text-brand-primary-700'
        : 'text-neutral-600 hover:text-brand-primary-700'
    }`;

  return (
    <div className="flex min-h-screen flex-col">
      {/* 顶部玻璃导航栏（sticky） */}
      <header className="sticky top-0 z-40 border-b border-white/40 bg-white/70 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Link to="/" aria-label="返回首页">
            <Logo size={30} />
          </Link>

          {/* 桌面导航 */}
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => linkClass(isActive)}>
                {item.label}
              </NavLink>
            ))}
            {isAuthenticated ? (
              <SpringLink to="/app" variant="ghost" className="ml-2 px-4 py-2">
                {accountLabel}
              </SpringLink>
            ) : (
              <SpringLink to="/auth/login" variant="ghost" className="ml-2 px-4 py-2">
                登录
              </SpringLink>
            )}
            <SpringLink to="/assessment" variant="accent" className="px-5 py-2">
              开始测评
            </SpringLink>
          </nav>

          {/* 移动端汉堡按钮 */}
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg p-2 text-neutral-700 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-brand-primary-300 md:hidden"
            aria-label={menuOpen ? '关闭菜单' : '打开菜单'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>

        {/* 移动端展开菜单 */}
        {menuOpen && (
          <nav className="border-t border-neutral-200/60 bg-white/90 px-4 py-3 backdrop-blur-md md:hidden">
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => linkClass(isActive)}
                >
                  {item.label}
                </NavLink>
              ))}
              <div className="mt-2 flex flex-col gap-2">
                {isAuthenticated ? (
                  <SpringLink to="/app" variant="ghost" className="justify-center py-2">
                    {accountLabel}
                  </SpringLink>
                ) : (
                  <SpringLink to="/auth/login" variant="ghost" className="justify-center py-2">
                    登录
                  </SpringLink>
                )}
                <SpringLink to="/assessment" variant="accent" className="justify-center py-2">
                  开始测评
                </SpringLink>
              </div>
            </div>
          </nav>
        )}
      </header>

      {/* 主内容区（保持居中约束） */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <Outlet />
      </main>

      {/* 页脚 */}
      <Footer columns={FOOTER_COLUMNS} />
    </div>
  );
}