import { familyOf, familyColor, FAMILY_LABEL } from '../../theme/tokens';

/**
 * GroupBadge 族群徽章
 * -------------------------------------------------------------
 * 入参 mbtiType（如 ENFJ），自动映射四族群色，展示类型码 + 族群名。
 * NT 分析家(蓝) / NF 外交家(紫) / SJ 守护者(绿) / SP 探险家(橙)。
 */

export interface GroupBadgeProps {
  /** 四字母 MBTI 类型，如 "ENFJ" */
  mbtiType: string;
  /** 尺寸，默认 md */
  size?: 'sm' | 'md' | 'lg';
  /** 是否显示族群中文名，默认 true */
  showLabel?: boolean;
  /** 追加类名 */
  className?: string;
}

const SIZE = {
  sm: { pad: 'px-2.5 py-1', code: 'text-sm', label: 'text-xs' },
  md: { pad: 'px-3.5 py-1.5', code: 'text-base', label: 'text-xs' },
  lg: { pad: 'px-4 py-2', code: 'text-lg', label: 'text-sm' },
} as const;

export function GroupBadge({
  mbtiType,
  size = 'md',
  showLabel = true,
  className = '',
}: GroupBadgeProps) {
  const type = mbtiType.toUpperCase();
  const family = familyOf(type);
  const color = familyColor(family);
  const label = FAMILY_LABEL[family];
  const s = SIZE[size];

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full font-medium ${s.pad} ${className}`}
      style={{ backgroundColor: `${color}1a`, color }}
      title={`${type} · ${label}`}
    >
      <span className={`font-mono font-bold tracking-wide ${s.code}`}>
        {type}
      </span>
      {showLabel ? (
        <span
          className={`border-l pl-2 font-sans ${s.label}`}
          style={{ borderColor: `${color}40` }}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}

export default GroupBadge;