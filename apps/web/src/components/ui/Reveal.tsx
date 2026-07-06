import type { CSSProperties, ElementType, ReactNode } from 'react';
import { useScrollReveal } from '../../hooks/useScrollReveal';

/**
 * Reveal 滚动揭示包装器
 * -------------------------------------------------------------
 * 封装 useScrollReveal + [data-reveal]，页面区块直接包裹即可获得
 * 一次性淡入上移动效（fadeUp / spring 缓动，prefers-reduced-motion 自动降级）。
 *
 * stagger 用法：在被包裹的直接元素上设置内联 style={{ '--i': n }}，
 * 或使用 <RevealItem index={n}> 简化，index.css 会据此计算 transition-delay。
 *
 * 注意：本组件在挂载时调用一次 useScrollReveal 扫描全局 [data-reveal]。
 * 若同一页面多处使用，扫描是幂等的（已揭示元素会被跳过）。
 */

export interface RevealProps {
  /** 被揭示的内容 */
  children: ReactNode;
  /** 渲染的标签，默认 div */
  as?: ElementType;
  /** 依赖数组变化时重新扫描（如路由/异步数据到达），默认空 */
  deps?: ReadonlyArray<unknown>;
  /** 追加类名 */
  className?: string;
  /** 追加内联样式 */
  style?: CSSProperties;
}

export function Reveal({
  children,
  as,
  deps = [],
  className = '',
  style,
}: RevealProps) {
  useScrollReveal(deps);
  const Tag = (as ?? 'div') as ElementType;
  return (
    <Tag data-reveal className={className} style={style}>
      {children}
    </Tag>
  );
}

export interface RevealItemProps {
  /** 内容 */
  children: ReactNode;
  /** stagger 序号，用于错峰延迟（index.css 计算 --i * 80ms） */
  index?: number;
  /** 渲染的标签，默认 div */
  as?: ElementType;
  /** 追加类名 */
  className?: string;
}

/** stagger 子项：设置 --i 序号，配合父级 Reveal 实现错峰入场 */
export function RevealItem({
  children,
  index = 0,
  as,
  className = '',
}: RevealItemProps) {
  const Tag = (as ?? 'div') as ElementType;
  return (
    <Tag className={className} style={{ '--i': index } as CSSProperties}>
      {children}
    </Tag>
  );
}

export default Reveal;