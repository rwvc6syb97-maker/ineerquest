import type { ReactNode } from 'react';

/**
 * EmptyState 空状态
 * -------------------------------------------------------------
 * 无数据兜底：几何意象图标 + 标题 + 说明 + 可选 CTA。
 * 图标为内置几何 SVG（罗盘/星图意象），非占位文本、非手绘卡通。
 */

export type EmptyStateIcon = 'compass' | 'search' | 'sparkle';

export interface EmptyStateProps {
  /** 标题文案 */
  title: ReactNode;
  /** 说明文案 */
  description?: ReactNode;
  /** 内置图标类型，默认 compass */
  icon?: EmptyStateIcon;
  /** CTA 区域（通常放 SpringButton/SpringLink） */
  action?: ReactNode;
  /** 追加类名 */
  className?: string;
}

const ICONS: Record<EmptyStateIcon, ReactNode> = {
  // 罗盘：探索/方向意象
  compass: (
    <>
      <circle cx="32" cy="32" r="24" fill="none" strokeWidth="2.5" />
      <polygon points="32,18 38,32 32,46 26,32" fill="currentColor" opacity="0.15" />
      <polygon points="32,18 38,32 32,32" fill="currentColor" />
      <circle cx="32" cy="32" r="3" fill="currentColor" />
    </>
  ),
  // 搜索：无结果意象
  search: (
    <>
      <circle cx="28" cy="28" r="16" fill="none" strokeWidth="2.5" />
      <line x1="40" y1="40" x2="50" y2="50" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  // 星芒：待生成/等待意象
  sparkle: (
    <>
      <path
        d="M32 12 L36 28 L52 32 L36 36 L32 52 L28 36 L12 32 L28 28 Z"
        fill="currentColor"
        opacity="0.15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </>
  ),
};

export function EmptyState({
  title,
  description,
  icon = 'compass',
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-neutral-200 px-6 py-14 text-center ${className}`}
    >
      <svg
        viewBox="0 0 64 64"
        className="h-16 w-16 text-brand-primary-400"
        stroke="currentColor"
        fill="none"
        aria-hidden="true"
      >
        {ICONS[icon]}
      </svg>
      <h3 className="font-display text-lg font-semibold text-brand-primary-950">
        {title}
      </h3>
      {description ? (
        <p className="max-w-sm text-sm leading-relaxed text-neutral-500">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export default EmptyState;