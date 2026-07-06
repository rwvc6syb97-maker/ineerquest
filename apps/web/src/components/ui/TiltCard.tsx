import { useRef, useState } from 'react';
import type { HTMLAttributes, ReactNode, PointerEvent } from 'react';

/**
 * TiltCard 3D 悬浮倾斜玻璃卡
 * -------------------------------------------------------------
 * - 鼠标移入时按指针位置做轻微 3D 倾斜（perspective + rotateX/rotateY，幅度 ≤ maxTilt）。
 * - 移出复位。内层玻璃质感：backdrop-blur + 半透明白底 + 细边框 + 柔和阴影。
 * - prefers-reduced-motion 下禁用倾斜（不绑定 pointer 事件、不写 transform），仅保留静态玻璃质感。
 * - 纯 CSS / 内联 style 实现，不依赖 tailwind 3D 工具类，避免改配置。
 *
 * 设计约束：仅用于高价值卡片（首页特性卡、报告主卡），克制使用，禁止全站滥用。
 */

export interface TiltCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onPointerMove' | 'onPointerLeave'> {
  /** 卡片内容 */
  children: ReactNode;
  /** 内边距强度，默认 md */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** 最大倾斜角度（deg），默认 8，建议 ≤ 8 保持克制 */
  maxTilt?: number;
  /** 追加类名 */
  className?: string;
}

const PADDING: Record<NonNullable<TiltCardProps['padding']>, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

/** 一次性检测用户是否偏好减弱动效 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function TiltCard({
  children,
  padding = 'md',
  maxTilt = 8,
  className = '',
  ...rest
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState<{ rx: number; ry: number }>({ rx: 0, ry: 0 });
  const [active, setActive] = useState(false);
  const reduced = prefersReducedMotion();

  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width; // 0~1
    const py = (e.clientY - rect.top) / rect.height; // 0~1
    // 指针在上方 → 卡片顶部后仰（rotateX 正）；指针在右侧 → 右侧后仰（rotateY 负）
    const rx = (0.5 - py) * maxTilt * 2;
    const ry = (px - 0.5) * maxTilt * 2;
    setTilt({ rx, ry });
    setActive(true);
  };

  const handleLeave = () => {
    if (reduced) return;
    setTilt({ rx: 0, ry: 0 });
    setActive(false);
  };

  const style = reduced
    ? undefined
    : ({
        transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) ${
          active ? 'translateY(-2px)' : ''
        }`,
        transition: active
          ? 'transform 120ms ease-out'
          : 'transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        transformStyle: 'preserve-3d',
        willChange: 'transform',
      } as const);

  return (
    <div
      ref={ref}
      className={`rounded-2xl border border-white/40 bg-white/60 shadow-lg backdrop-blur-md ${PADDING[padding]} ${className}`}
      style={style}
      onPointerMove={reduced ? undefined : handleMove}
      onPointerLeave={reduced ? undefined : handleLeave}
      {...rest}
    >
      {children}
    </div>
  );
}

export default TiltCard;