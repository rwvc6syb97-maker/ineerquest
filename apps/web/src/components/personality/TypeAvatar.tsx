import { familyOf, familyColor } from '../../theme/tokens';
import type { Family } from '../../theme/tokens';

/**
 * TypeAvatar 人格意象
 * -------------------------------------------------------------
 * 入参 mbtiType，用几何 SVG（星座/罗盘意象）按族群色渲染。
 * 每个族群拥有独立几何母题（非手绘卡通、非 div 假截图）：
 *  - analyst(NT)  六边形晶格   —— 结构 / 系统
 *  - diplomat(NF) 交叠星芒     —— 连接 / 理想
 *  - sentinel(SJ) 同心盾环     —— 秩序 / 守护
 *  - explorer(SP) 放射罗盘     —— 探索 / 行动
 */

export interface TypeAvatarProps {
  /** 四字母 MBTI 类型，如 "INTP" */
  mbtiType: string;
  /** 像素尺寸，默认 96 */
  size?: number;
  /** 是否在意象上叠加类型码，默认 false */
  showCode?: boolean;
  /** 追加类名 */
  className?: string;
}

/** 各族群的几何母题（viewBox 100x100，居中于 50,50） */
function Motif({ family, color }: { family: Family; color: string }) {
  const stroke = color;
  const soft = `${color}22`;
  switch (family) {
    case 'analyst':
      return (
        <>
          <polygon
            points="50,14 81,32 81,68 50,86 19,68 19,32"
            fill={soft}
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <polygon
            points="50,30 68,40 68,60 50,70 32,60 32,40"
            fill="none"
            stroke={stroke}
            strokeWidth="1.5"
          />
          <line x1="50" y1="14" x2="50" y2="30" stroke={stroke} strokeWidth="1.5" />
          <line x1="81" y1="32" x2="68" y2="40" stroke={stroke} strokeWidth="1.5" />
          <line x1="19" y1="68" x2="32" y2="60" stroke={stroke} strokeWidth="1.5" />
        </>
      );
    case 'diplomat':
      return (
        <>
          <path
            d="M50 12 L58 42 L88 50 L58 58 L50 88 L42 58 L12 50 L42 42 Z"
            fill={soft}
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <circle cx="50" cy="50" r="12" fill="none" stroke={stroke} strokeWidth="1.5" />
          <circle cx="50" cy="50" r="4" fill={stroke} />
        </>
      );
    case 'sentinel':
      return (
        <>
          <path
            d="M50 14 L80 26 V52 C80 70 66 82 50 88 C34 82 20 70 20 52 V26 Z"
            fill={soft}
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M50 28 L68 35 V52 C68 63 60 71 50 75 C40 71 32 63 32 52 V35 Z"
            fill="none"
            stroke={stroke}
            strokeWidth="1.5"
          />
        </>
      );
    case 'explorer':
    default:
      return (
        <>
          <circle cx="50" cy="50" r="34" fill={soft} stroke={stroke} strokeWidth="2.5" />
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (Math.PI * 2 * i) / 8 - Math.PI / 2;
            const inner = 12;
            const outer = 32;
            return (
              <line
                key={i}
                x1={50 + inner * Math.cos(a)}
                y1={50 + inner * Math.sin(a)}
                x2={50 + outer * Math.cos(a)}
                y2={50 + outer * Math.sin(a)}
                stroke={stroke}
                strokeWidth={i % 2 === 0 ? 2.5 : 1}
                strokeLinecap="round"
              />
            );
          })}
          <circle cx="50" cy="50" r="5" fill={stroke} />
        </>
      );
  }
}

export function TypeAvatar({
  mbtiType,
  size = 96,
  showCode = false,
  className = '',
}: TypeAvatarProps) {
  const type = mbtiType.toUpperCase();
  const family = familyOf(type);
  const color = familyColor(family);
  return (
    <div className={`relative inline-flex ${className}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${type} 人格意象`}>
        <Motif family={family} color={color} />
      </svg>
      {showCode ? (
        <span
          className="absolute inset-x-0 bottom-1 text-center font-mono text-xs font-bold"
          style={{ color }}
        >
          {type}
        </span>
      ) : null}
    </div>
  );
}

export default TypeAvatar;