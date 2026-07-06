import type { CSSProperties } from 'react';

/**
* DimensionBar 维度条
 * -------------------------------------------------------------
 * 展示单个 MBTI 维度的双极倾向（如 内向 I ←→ 外向 E）。
 * 配合 index.css 的 [data-reveal] / .dimension-bar__fill 实现
 * 一次性填充动效：进入视口后宽度从 0 填充到 value%。
 *
 * 用法：将本组件放入 <Reveal> 内即可自动触发填充；
 * 或手动给外层加 [data-reveal] 与 useScrollReveal。
 * CSS 通过 --dimension-bar-target 读取目标宽度。
 */

export interface DimensionBarProps {
  /** 维度名（如 "能量来源"） */
  label: string;
  /** 左极标签（如 "内向 I"） */
  leftPole: string;
  /** 右极标签（如 "外向 E"） */
  rightPole: string;
  /** 0-100，越大越偏右极 */
  value: number;
  /** 维度主题色（十六进制），用于填充与偏向文字 */
  dimensionColor: string;
  /** 追加类名 */
  className?: string;
}

export function DimensionBar({
  label,
  leftPole,
  rightPole,
  value,
  dimensionColor,
  className = '',
}: DimensionBarProps) {
  const v = Math.max(0, Math.min(100, value));
  const towardRight = v >= 50;
  const dominant = towardRight ? rightPole : leftPole;
  const strength = Math.round(Math.abs(v - 50) * 2); // 0-100 偏向强度

  return (
    <div
      className={`dimension-bar ${className}`}
      data-reveal
      style={{ ['--dimension-bar-target' as string]: `${v}%` } as CSSProperties}
    >
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span
          className={`font-medium ${!towardRight ? 'text-neutral-800' : 'text-neutral-400'}`}
        >
          {leftPole}
        </span>
        <span className="font-sans text-neutral-400">{label}</span>
        <span
          className={`font-medium ${towardRight ? 'text-neutral-800' : 'text-neutral-400'}`}
        >
          {rightPole}
        </span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="dimension-bar__fill absolute inset-y-0 left-0 rounded-full"
          style={{ backgroundColor: dimensionColor }}
        />
        {/* 50% 中线标记 */}
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-neutral-300" />
      </div>
      <div
        className="mt-1 text-right font-mono text-xs"
        style={{ color: dimensionColor }}
      >
        倾向 {dominant} · {strength}%
      </div>
    </div>
  );
}

export default DimensionBar;