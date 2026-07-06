import { forwardRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

// 设计令牌（THREE DIALS）：品牌蓝 + 唯一强调橙，禁纯黑
const TOKENS = {
  brand: '#3b82f6',
  accent: '#f97316',
} as const;

type Variant = 'primary' | 'accent' | 'ghost';

interface BaseProps {
  children: ReactNode;
  variant?: Variant;
  className?: string;
}

// 共享样式：Spring 物理反馈通过 CSS transition + active 缩放模拟
// 无障碍：prefers-reduced-motion 时禁用位移/缩放（见 index.css 全局降级规则）
const variantClass: Record<Variant, string> = {
  primary:
    'text-white shadow-sm hover:brightness-110 focus-visible:ring-2 focus-visible:ring-offset-2',
  accent:
    'text-white shadow-sm hover:brightness-110 focus-visible:ring-2 focus-visible:ring-offset-2',
  ghost:
    'border border-slate-300 text-slate-700 hover:bg-slate-50 focus-visible:ring-2',
};

function useSpringStyle(variant: Variant, pressed: boolean) {
  const bg =
    variant === 'accent' ? TOKENS.accent : variant === 'primary' ? TOKENS.brand : undefined;
  return {
    backgroundColor: bg,
    // Spring 感：按下略缩，回弹用 cubic-bezier 过冲曲线（reduced-motion 由全局 CSS 覆盖为 none）
    transform: pressed ? 'scale(0.96)' : 'scale(1)',
    transition: 'transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1), filter 160ms ease',
  } as const;
}

const baseCls =
  'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold outline-none select-none';

// 按钮形态
export const SpringButton = forwardRef<
  HTMLButtonElement,
  BaseProps & ButtonHTMLAttributes<HTMLButtonElement>
>(function SpringButton({ children, variant = 'primary', className = '', ...rest }, ref) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      ref={ref}
      className={`${baseCls} ${variantClass[variant]} ${className}`}
      style={useSpringStyle(variant, pressed)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      {...rest}
    >
      {children}
    </button>
  );
});

// 链接形态（内部路由跳转）
export function SpringLink({
  to,
  children,
  variant = 'primary',
  className = '',
}: BaseProps & { to: string }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Link
      to={to}
      className={`${baseCls} ${variantClass[variant]} ${className}`}
      style={useSpringStyle(variant, pressed)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
    >
      {children}
    </Link>
  );
}