import type { HTMLAttributes, ReactNode } from 'react';

/**
 * StatPill 数据药丸
 * -------------------------------------------------------------
 * 以 mono 字体展示数值（匹配度、百分比、分数等），
 * 附可选标签，用于报告/职业匹配等数据密集区。
 */

export type StatPillTone = 'brand' | 'accent' | 'neutral';

export interface StatPillProps extends HTMLAttributes<HTMLDivElement> {
  /** 数值主体，如 "92%" / "4.8" */
  value: ReactNode;
  /** 数值前的可选标签，如 "匹配度" */
  label?: ReactNode;
  /** 数值后的可选单位/后缀 */
  suffix?: ReactNode;
  /** 色调，默认 brand */
  tone?: StatPillTone;
  /** 自定义主题色（覆盖 tone），用于族群色 */
  color?: string;
  /** 追加类名 */
  className?: string;
}

const TONE: Record<StatPillTone, { bg: string; fg: string }> = {
  brand: { bg: 'bg-brand-primary-50', fg: 'text-brand-primary-700' },
  accent: { bg: 'bg-brand-accent-50', fg: 'text-brand-accent-700' },
  neutral: { bg: 'bg-neutral-100', fg: 'text-neutral-700' },
};

export function StatPill({
  value,
  label,
  suffix,
  tone = 'brand',
  color,
  className = '',
  ...rest
}: StatPillProps) {
  const t = TONE[tone];
  const style = color
    ? { backgroundColor: `${color}14`, color }
    : undefined;
  const bgCls = color ? '' : `${t.bg} ${t.fg}`;
  return (
    <div
      className={`inline-flex items-baseline gap-1.5 rounded-full px-3 py-1.5 ${bgCls} ${className}`}
      style={style}
      {...rest}
    >
      {label ? (
        <span className="font-sans text-xs font-medium opacity-80">{label}</span>
      ) : null}
      <span className="font-mono text-base font-semibold tabular-nums leading-none">
        {value}
      </span>
      {suffix ? (
        <span className="font-mono text-xs opacity-70">{suffix}</span>
      ) : null}
    </div>
  );
}

export default StatPill;