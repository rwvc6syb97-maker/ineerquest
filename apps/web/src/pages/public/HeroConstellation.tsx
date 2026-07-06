/**
 * HeroConstellation —— 首页 Hero 右侧抽象视觉
 * -------------------------------------------------------------
 * 「内心地形图 / 星图 / 罗盘」意象的功能性抽象 SVG：
 * - 底层同心等高线（内心地形）
 * - 中层四族群节点 + 连线（星座网络，四色对应 NT/NF/SJ/SP）
 * - 顶层罗盘刻度环 + 指针（探索方向）
 * 禁具象大脑/灯泡/齿轮 icon；纯几何构成，符合设计规范。
 * 缓慢旋转动效经 prefers-reduced-motion 全局降级。
 */
import { FAMILY_COLORS } from '../../theme/tokens';

/** 四族群星座节点坐标（viewBox 400x400，中心 200,200） */
const NODES = [
  { x: 118, y: 96, color: FAMILY_COLORS.analyst, label: 'NT' },
  { x: 300, y: 132, color: FAMILY_COLORS.diplomat, label: 'NF' },
  { x: 96, y: 286, color: FAMILY_COLORS.sentinel, label: 'SJ' },
  { x: 296, y: 300, color: FAMILY_COLORS.explorer, label: 'SP' },
];

export function HeroConstellation() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[520px]">
      <svg viewBox="0 0 400 400" className="h-full w-full" role="img" aria-label="内心地形图与人格星座意象">
        <defs>
          <radialGradient id="hero-glow" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* 背景柔光 */}
        <circle cx="200" cy="200" r="190" fill="url(#hero-glow)" />

        {/* 底层：内心地形等高线（同心不规则环，暗示地貌） */}
        <g fill="none" stroke="#3b82f6" strokeOpacity="0.16">
          <ellipse cx="200" cy="205" rx="150" ry="140" strokeWidth="1.5" />
          <ellipse cx="196" cy="200" rx="118" ry="112" strokeWidth="1.5" />
          <ellipse cx="204" cy="198" rx="84" ry="82" strokeWidth="1.5" />
          <ellipse cx="200" cy="200" rx="50" ry="52" strokeWidth="1.5" />
        </g>

        {/* 星座连线（族群网络） */}
        <g stroke="#1e3a8a" strokeOpacity="0.28" strokeWidth="1.5">
          <line x1="200" y1="200" x2={NODES[0].x} y2={NODES[0].y} />
          <line x1="200" y1="200" x2={NODES[1].x} y2={NODES[1].y} />
          <line x1="200" y1="200" x2={NODES[2].x} y2={NODES[2].y} />
          <line x1="200" y1="200" x2={NODES[3].x} y2={NODES[3].y} />
          <line x1={NODES[0].x} y1={NODES[0].y} x2={NODES[1].x} y2={NODES[1].y} />
          <line x1={NODES[1].x} y1={NODES[1].y} x2={NODES[3].x} y2={NODES[3].y} />
          <line x1={NODES[3].x} y1={NODES[3].y} x2={NODES[2].x} y2={NODES[2].y} />
          <line x1={NODES[2].x} y1={NODES[2].y} x2={NODES[0].x} y2={NODES[0].y} />
        </g>

        {/* 罗盘刻度环（缓慢旋转） */}
        <g
          className="hero-compass"
          style={{ transformOrigin: '200px 200px' }}
        >
          <circle cx="200" cy="200" r="150" fill="none" stroke="#101a39" strokeOpacity="0.12" strokeWidth="1" />
          {Array.from({ length: 48 }).map((_, i) => {
            const a = (Math.PI * 2 * i) / 48;
            const major = i % 4 === 0;
            const r1 = major ? 138 : 144;
            const r2 = 150;
            return (
              <line
                key={i}
                x1={200 + r1 * Math.cos(a)}
                y1={200 + r1 * Math.sin(a)}
                x2={200 + r2 * Math.cos(a)}
                y2={200 + r2 * Math.sin(a)}
                stroke="#1e3a8a"
                strokeOpacity={major ? 0.4 : 0.18}
                strokeWidth={major ? 2 : 1}
              />
            );
          })}
        </g>

        {/* 族群星座节点 */}
        {NODES.map((n) => (
          <g key={n.label}>
            <circle cx={n.x} cy={n.y} r="16" fill={n.color} fillOpacity="0.14" />
            <circle cx={n.x} cy={n.y} r="6" fill={n.color} />
            <text
              x={n.x}
              y={n.y - 22}
              textAnchor="middle"
              className="font-mono"
              fontSize="12"
              fontWeight="700"
              fill={n.color}
            >
              {n.label}
            </text>
          </g>
        ))}

        {/* 罗盘指针（指向强调橙，探索方向） */}
        <g style={{ transformOrigin: '200px 200px' }} className="hero-needle">
          <polygon points="200,120 210,205 200,215 190,205" fill={FAMILY_COLORS.explorer} />
          <polygon points="200,280 210,205 200,195 190,205" fill="#1e3a8a" fillOpacity="0.35" />
        </g>

        {/* 中心枢纽 */}
        <circle cx="200" cy="200" r="10" fill="#fff" stroke="#101a39" strokeOpacity="0.2" strokeWidth="1.5" />
        <circle cx="200" cy="200" r="4" fill="#101a39" fillOpacity="0.6" />
      </svg>

      {/* 局部旋转动效（reduced-motion 降级见下方 style） */}
      <style>{`
        @keyframes heroSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .hero-compass { animation: heroSpin 90s linear infinite; }
        .hero-needle { animation: heroSpin 60s linear infinite reverse; }
        @media (prefers-reduced-motion: reduce) {
          .hero-compass, .hero-needle { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

export default HeroConstellation;