import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Card / GlassCard 卡片原子组件
 * -------------------------------------------------------------
 * - Card：标准卡片，柔和圆角 radius-2xl + shadow，营销页/数据区通用容器。
 * - GlassCard：玻璃拟态卡（仅用于高价值场景，如报告悬浮卡），毛玻璃 + 半透明白底。
 *
 * 设计约束：玻璃拟态仅限报告悬浮卡等高价值场景，禁止满屏使用。
 */

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 卡片内容 */
  children: ReactNode;
  /** 内边距强度，默认 md（VISUAL_DENSITY=4，数据区可用 sm 增密） */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** 是否启用 hover 抬升（spring 缓动），默认 false */
  interactive?: boolean;
  /** 追加类名 */
  className?: string;
}

const PADDING: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function Card({
  children,
  padding = 'md',
  interactive = false,
  className = '',
  ...rest
}: CardProps) {
  const hover = interactive
    ? 'transition-transform duration-normal ease-spring hover:-translate-y-1 hover:shadow-lg'
    : '';
  return (
    <div
      className={`rounded-2xl border border-neutral-200/70 bg-white shadow-sm ${PADDING[padding]} ${hover} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  /** 卡片内容 */
  children: ReactNode;
  /** 内边距强度，默认 md */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** 追加类名 */
  className?: string;
}

/**
 * 玻璃拟态卡：半透明白 + backdrop-blur + 细边框高光。
 * 仅用于报告页悬浮信息卡等高价值场景。
 */
export function GlassCard({
  children,
  padding = 'md',
  className = '',
  ...rest
}: GlassCardProps) {
  return (
    <div
      className={`rounded-2xl border border-white/40 bg-white/60 shadow-lg backdrop-blur-md ${PADDING[padding]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}