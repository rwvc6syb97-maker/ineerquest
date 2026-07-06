/**
 * 维度可视化（纯 SVG 自绘，零第三方依赖，保证 vite build 通过）
 * - RadarChart：四维度雷达图
 * - DimensionBars：四维度倾向柱状条
 * 动效通过 CSS transition，prefers-reduced-motion 由全局 index.css 降级。
 * TODO(blocked)：如需 Chart.js 精细交互，安装 chart.js/react-chartjs-2 后替换本组件。
 */
import { COLORS } from '../../theme/tokens';

export interface DimItem {
  dimension: string;
  left: string;
  right: string;
  /** 0-100，越大越偏 right */
  score: number;
}

/** 雷达图：以 score 距 50 的偏移强度作为半径 */
export function RadarChart({ data, color = COLORS.brand }: { data: DimItem[]; color?: string }) {
  const size = 240;
  const c = size / 2;
  const r = 90;
  const n = data.length || 4;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  // 强度 = |score-50|/50，范围 0-1
  const point = (i: number, strength: number) => {
    const rad = r * Math.max(0.15, strength);
    return [c + rad * Math.cos(angle(i)), c + rad * Math.sin(angle(i))];
  };
  const polygon = data
    .map((d, i) => point(i, Math.abs(d.score - 50) / 50).join(','))
    .join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="维度雷达图">
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon
          key={ring}
          points={data
            .map((_, i) => [c + r * ring * Math.cos(angle(i)), c + r * ring * Math.sin(angle(i))].join(','))
            .join(' ')}
          fill="none"
          stroke="#e2e8f0"
        />
      ))}
      {data.map((d, i) => {
        const [x, y] = [c + r * Math.cos(angle(i)), c + r * Math.sin(angle(i))];
        return <line key={d.dimension} x1={c} y1={c} x2={x} y2={y} stroke="#e2e8f0" />;
      })}
      <polygon points={polygon} fill={`${color}33`} stroke={color} strokeWidth={2} />
      {data.map((d, i) => {
        const [x, y] = [c + (r + 16) * Math.cos(angle(i)), c + (r + 16) * Math.sin(angle(i))];
        const dominant = d.score >= 50 ? d.right : d.left;
        return (
          <text key={d.dimension} x={x} y={y} fontSize={11} fill="#475569" textAnchor="middle" dominantBaseline="middle">
            {dominant}
          </text>
        );
      })}
    </svg>
  );
}

/** 维度倾向柱状条：左右两端标签 + 指示位置 */
export function DimensionBars({ data, color = COLORS.brand }: { data: DimItem[]; color?: string }) {
  return (
    <div className="flex flex-col gap-4">
      {data.map((d) => {
        const leftPct = 100 - d.score;
        const stronger = d.score >= 50 ? d.right : d.left;
        return (
          <div key={d.dimension}>
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span className={leftPct >= 50 ? 'font-semibold text-slate-800' : ''}>{d.left}</span>
              <span className="text-slate-400">{d.dimension}</span>
              <span className={d.score >= 50 ? 'font-semibold text-slate-800' : ''}>{d.right}</span>
            </div>
            <div className="relative h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${d.score}%`,
                  backgroundColor: color,
                  transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
                }}
              />
            </div>
            <div className="mt-1 text-right text-xs" style={{ color }}>
              倾向 {stronger} · {Math.abs(d.score - 50) * 2}%
            </div>
          </div>
        );
      })}
    </div>
  );
}