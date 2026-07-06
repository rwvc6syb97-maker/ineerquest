import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Tag / Chip 标签组件
 * -------------------------------------------------------------
 * 用于职业标签、技能标签、类别标记等。
 * 支持中性 / 品牌蓝 / 强调橙 / 自定义色四种基调。
 * 强调橙（accent）仅用于关键指引，避免滥用。
 */

export type TagTone = 'neutral' | 'brand' | 'accent' | 'success';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** 标签文案 */
  children: ReactNode;
  /** 色调基调，默认 neutral */
  tone?: TagTone;
  /** 尺寸，默认 md */
  size?: 'sm' | 'md';
  /** 自定义主题色（十六进制），提供时覆盖 tone，用于族群色标签 */
  color?: string;
  /** 追加类名 */
  className?: string;
}

const TONE: Record<TagTone, string> = {
  neutral: 'bg-neutral-100 text-neutral-700',
  brand: 'bg-brand-primary-50 text-brand-primary-700',
  accent: 'bg-brand-accent-50 text-brand-accent-700',
  success: 'bg-success-50 text-success-700',
};

const SIZE = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
} as const;

export function Tag({
  children,
  tone = 'neutral',
  size = 'md',
  color,
  className = '',
  ...rest
}: TagProps) {
  // 自定义色：以 12% 透明底 + 实色文字构造，保证 WCAG 对比
  const customStyle = color
    ? { backgroundColor: `${color}1f`, color }
    : undefined;
  const toneCls = color ? '' : TONE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium leading-none ${SIZE[size]} ${toneCls} ${className}`}
      style={customStyle}
      {...rest}
    >
      {children}
    </span>
  );
}

export default Tag;