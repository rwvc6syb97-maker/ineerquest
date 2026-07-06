/**
 * 运营后台数据看板图表（纯 SVG 自绘，零第三方依赖）
 * -------------------------------------------------------------
 * 用于 T4-17 数据看板：
 *  - LineChart  折线图（用户增长 / 营收趋势）
 *  - FunnelChart 漏斗图（测评转化）
 *  - PieChart    环形占比图（付费/免费）
 *  - GaugeChart  仪表盘（完成率）
 * 未安装 Chart.js，采用纯 SVG 保证 tsc/vite 通过。纯计算函数已抽出便于单测。
 */
import { COLORS } from '../../theme/tokens';

// ============ 纯计算工具（可单测） ============

/** 将数值序列映射为 SVG polyline 点集（等宽 X，纵向按 max 归一）。 */
export function buildLinePoints(
  values: number[],
  width: number,
  height: number,
  pad = 8,
): string {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const step = values.length > 1 ? innerW / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = pad + step * i;
      const y = pad + innerH - (v / max) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** 计算漏斗各层相对首层的转化率（0~1）。 */
export function funnelRatios(counts: number[]): number[] {
  const base = counts[0] || 0;
  if (base <= 0) return counts.map(() => 0);
  return counts.map((c) => Math.min(1, c / base));
}

/** 环形图弧长：返回 stroke-dasharray 与 dashoffset。 */
export function donutDash(ratio: number, circumference: number): { dash: number; gap: number } {
  const r = Math.max(0, Math.min(1, ratio));
  return { dash: circumference * r, gap: circumference * (1 - r) };
}

// ============ 组件 ============

export interface LineChartProps {
  labels: string[];
  values: number[];
  color?: string;
  height?: number;
  /** Y 值格式化（如金额分转元） */
  formatValue?: (v: number) => string;
}

/** 折线图（自适应宽度，viewBox 固定像素） */
export function LineChart({
  labels,
  values,
  color = COLORS.brand,
  height = 200,
  formatValue,
}: LineChartProps) {
  const width = 640;
  const pad = 12;
  if (values.length === 0) {
    return <div className="py-10 text-center text-sm text-slate-400">暂无数据</div>;
  }
  const points = buildLinePoints(values, width, height, pad);
  const max = Math.max(...values, 1);
  const area = `${pad},${height - pad} ${points} ${width - pad},${height - pad}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="趋势折线图">
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <line
          key={g}
          x1={pad}
          x2={width - pad}
          y1={pad + (height - pad * 2) * (1 - g)}
          y2={pad + (height - pad * 2) * (1 - g)}
          stroke="#eef2f7"
        />
      ))}
      <polygon points={area} fill={`${color}1a`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <text x={pad} y={pad + 4} fontSize={11} fill="#94a3b8">
        {formatValue ? formatValue(max) : max}
      </text>
      {labels.length > 0 && (
        <>
          <text x={pad} y={height - 2} fontSize={10} fill="#94a3b8" textAnchor="start">
            {labels[0]}
          </text>
          <text x={width - pad} y={height - 2} fontSize={10} fill="#94a3b8" textAnchor="end">
            {labels[labels.length - 1]}
          </text>
        </>
      )}
    </svg>
  );
}

export interface FunnelChartProps {
  steps: Array<{ label: string; count: number }>;
  color?: string;
}

/** 漏斗图（横向条，宽度按转化率递减） */
export function FunnelChart({ steps, color = COLORS.brand }: FunnelChartProps) {
  if (steps.length === 0) {
    return <div className="py-10 text-center text-sm text-slate-400">暂无数据</div>;
  }
  const ratios = funnelRatios(steps.map((s) => s.count));
  return (
    <div className="flex flex-col gap-3">
      {steps.map((s, i) => {
        const pct = ratios[i];
        return (
          <div key={s.label}>
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>{s.label}</span>
              <span className="tabular-nums">
                {s.count.toLocaleString()} · {(pct * 100).toFixed(1)}%
              </span>
            </div>
        <div className="h-6 overflow-hidden rounded-md bg-slate-100">
              <div
                className="h-full rounded-md"
                style={{
                  width: `${Math.max(4, pct * 100)}%`,
                  backgroundColor: color,
                  transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface PieChartProps {
  /** 占比（0~1），如付费率 */
  ratio: number;
  label?: string;
  color?: string;
  trackColor?: string;
  size?: number;
}

/** 环形占比图 */
export function PieChart({
  ratio,
  label,
  color = COLORS.accent,
  trackColor = '#e2e8f0',
  size = 160,
}: PieChartProps) {
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const { dash, gap } = donutDash(ratio, circumference);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="占比环形图">
  <circle cx={c} cy={c} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${gap}`}
        strokeDashoffset={circumference / 4}
        strokeLinecap="round"
        transform={`rotate(-90 ${c} ${c})`}
        style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.22,1,0.36,1)' }}
      />
      <text x={c} y={c - 2} fontSize={22} fill="#0f172a" textAnchor="middle" fontWeight={700}>
        {(ratio * 100).toFixed(1)}%
      </text>
      {label && (
        <text x={c} y={c + 20} fontSize={12} fill="#64748b" textAnchor="middle">
          {label}
        </text>
      )}
    </svg>
  );
}

export interface GaugeChartProps {
  /** 0~1 */
  value: number;
  label?: string;
  color?: string;
  size?: number;
}

/** 半圆仪表盘（测评完成率） */
export function GaugeChart({ value, label, color = COLORS.brand, size = 200 }: GaugeChartProps) {
  const v = Math.max(0, Math.min(1, value));
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = size / 2;
  // 半圆周长
  const semi = Math.PI * r;
  const dash = semi * v;
  const gap = semi * (1 - v);
  const height = size / 2 + 30;
  return (
    <svg viewBox={`0 0 ${size} ${height}`} width={size} height={height} role="img" aria-label="完成率仪表盘">
      <path
        d={`M ${stroke / 2} ${c} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${c}`}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <path
        d={`M ${stroke / 2} ${c} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${c}`}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${gap}`}
        style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.22,1,0.36,1)' }}
      />
      <text x={c} y={c - 4} fontSize={26} fill="#0f172a" textAnchor="middle" fontWeight={700}>
        {(v * 100).toFixed(1)}%
      </text>
      {label && (
        <text x={c} y={c + 18} fontSize={12} fill="#64748b" textAnchor="middle">
          {label}
        </text>
      )}
    </svg>
  );
}