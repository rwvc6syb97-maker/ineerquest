import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { SpringLink } from '../system/SpringButton';
import { Logo } from './Logo';

/**
 * Nav 公共布局顶栏
 * -------------------------------------------------------------
 * - Logo（星图/罗盘意象） + 导航链接 + 登录/开始测评 CTA。
 * - 响应式：桌面横向导航，移动端汉堡菜单抽屉。
 * - 滚动时背景由透明渐变为毛玻璃白（scroll > 12px 触发）。
 */

export interface NavItem {
  /** 链接文案 */
  label: string;
  /** 目标路由 */
  to: string;
}

export interface NavProps {
  /** 导航链接，默认提供产品站基础项 */
  items?: NavItem[];
  /** 登录路由，默认 /login */
  loginTo?: string;
  /** 开始测评路由，默认 /assessment/intro */
  ctaTo?: string;
  /** 追加类名 */
  className?: string;
}

const DEFAULT_ITEMS: NavItem[] = [
  { label: '产品介绍', to: '/#features' },
  { label: '人格类型', to: '/#types' },
  { label: '职业地图', to: '/#careers' },
  { label: '定价', to: '/#pricing' },
];

export function Nav({
  items = DEFAULT_ITEMS,
  loginTo = '/auth/login',
  ctaTo = '/assessment/intro',
  className = '',
}: NavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const shell = scrolled
    ? 'bg-white/80 shadow-sm backdrop-blur-md'
    : 'bg-transparent';

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-normal ease-spring ${shell} ${className}`}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link to="/" aria-label="返回首页">
          <Logo size={30} />
        </Link>

        {/* 桌面导航 */}
        <ul className="hidden items-center gap-7 md:flex">
          {items.map((item) => (
            <li key={item.to}>
       <NavLink
                to={item.to}
                className="text-sm font-medium text-neutral-600 transition-colors hover:text-brand-primary-600"
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* 桌面 CTA */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            to={loginTo}
            className="text-sm font-medium text-neutral-700 transition-colors hover:text-brand-primary-600"
          >
            登录
          </Link>
          <SpringLink to={ctaTo} variant="accent">
            开始测评
          </SpringLink>
        </div>

        {/* 移动端汉堡按钮 */}
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100 md:hidden"
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
      </nav>

      {/* 移动端抽屉 */}
      {open ? (
        <div className="border-t border-neutral-200 bg-white/95 backdrop-blur-md md:hidden">
          <ul className="flex flex-col gap-1 px-4 py-3">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
            <li className="mt-2 flex flex-col gap-2 border-t border-neutral-100 pt-3">
              <Link
                to={loginTo}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                登录
              </Link>
              <SpringLink to={ctaTo} variant="accent" className="w-full">
                开始测评
              </SpringLink>
            </li>
          </ul>
        </div>
      ) : null}
    </header>
  );
}

export default Nav;