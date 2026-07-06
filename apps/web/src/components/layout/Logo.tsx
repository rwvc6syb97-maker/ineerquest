/**
 * Logo 品牌标识
 * -------------------------------------------------------------
 * 星图 / 罗盘意象 SVG（非纯装饰）：外圈罗盘环 + 内部指向星芒，
 * 呼应「向内求索 InnerQuest」的探索母题。可独立使用或含文字。
 */

export interface LogoProps {
  /** 图标像素尺寸，默认 32 */
  size?: number;
  /** 是否显示品牌文字，默认 true */
  withText?: boolean;
  /** 图标主色，默认品牌蓝；深色底可传白色 */
  color?: string;
  /** 文字颜色类名，默认深蓝；深色底可传 text-white */
  textClassName?: string;
  /** 追加类名 */
  className?: string;
}

export function Logo({
  size = 32,
  withText = true,
  color = '#3b82f6',
  textClassName = 'text-brand-primary-950',
  className = '',
}: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="InnerQuest 标识">
        {/* 罗盘外环 */}
        <circle cx="20" cy="20" r="17" fill="none" stroke={color} strokeWidth="2" />
        {/* 指向星芒（上强下弱，指示方向感） */}
        <polygon points="20,6 24,20 20,34 16,20" fill={color} opacity="0.2" />
        <polygon points="20,6 24,20 20,20" fill={color} />
        {/* 横向指针 */}
        <polygon points="34,20 20,24 6,20 20,16" fill="none" stroke={color} strokeWidth="1.5" />
        {/* 内核 */}
        <circle cx="20" cy="20" r="2.5" fill={color} />
      </svg>
      {withText ? (
        <span className={`font-display text-lg font-bold tracking-tight ${textClassName}`}>
          向内求索
          <span className="ml-1 font-sans text-sm font-medium opacity-60">
            InnerQuest
          </span>
        </span>
      ) : null}
    </span>
  );
}

export default Logo;