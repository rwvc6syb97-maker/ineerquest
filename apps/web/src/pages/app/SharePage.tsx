/**
 * P14 分享海报页
 * - 基于报告数据渲染精致 SVG 海报（族群色主视觉），零第三方依赖
 * - 罗盘/星图几何母题 + 类型徽章 + 四维度简况色块（禁具象 icon）
 * - 生成分享短链（调 shareReport，失败用本地兜底）；复制链接 / 右键保存 SVG
 * TODO(blocked)：接入后端 poster 渲染或前端 html2canvas 导出 PNG。
 */
import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useReport, useShareReport } from '../../hooks/useReport';
import { COLORS, FAMILY_COLORS, FAMILY_LABEL } from '../../theme/tokens';
import {
  SectionHeading,
  GroupBadge,
  StatPill,
  SpringButton,
  Reveal,
  EmptyState,
} from '../../components';

export function SharePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: report, isLoading } = useReport(id);
  const share = useShareReport();
  const [copied, setCopied] = useState(false);

  const shareUrl = useMemo(() => `${window.location.origin}/s/${id}`, [id]);

  if (isLoading || !report) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <EmptyState
          icon="sparkle"
          title="海报生成中…"
          description="正在把你的人格名片绘制成可分享的视觉卡片。"
        />
      </div>
    );
  }

  const familyColor = FAMILY_COLORS[report.family];
  // 摘要分行（每行 ~15 字，最多 3 行）
  const summaryLines = report.summary.slice(0, 45).match(/.{1,15}/g) ?? [];

  const copyLink = async () => {
    let url = shareUrl;
    try {
      const res = await share.mutateAsync(id);
      url = res.shareUrl || shareUrl;
    } catch {
      // 无后端兜底：使用本地短链
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="mx-auto max-w-lg px-4 pb-20">
      <SectionHeading
        as="h1"
        size="md"
        align="center"
        eyebrow="Share"
        title="分享你的人格名片"
        subtitle="长按或右键保存图片，让懂你的人一眼读懂你。"
        className="mt-8"
      />

      {/* SVG 海报 */}
      <Reveal deps={[report.id]} className="mt-8 flex justify-center">
        <svg
          viewBox="0 0 360 540"
          width="320"
          height="480"
          role="img"
          aria-label={`${report.mbtiType} 人格分享海报`}
          className="rounded-3xl shadow-xl"
        >
          <defs>
            <linearGradient id="pg-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={familyColor} />
              <stop offset="100%" stopColor={COLORS.deep} />
            </linearGradient>
            <radialGradient id="pg-glow" cx="50%" cy="34%" r="55%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* 底 */}
          <rect width="360" height="540" rx="24" fill="url(#pg-bg)" />
          <rect width="360" height="540" rx="24" fill="url(#pg-glow)" />

          {/* 罗盘/星图母题：同心圆 + 十字准星 + 指针 */}
          <g stroke="#ffffff" fill="none" opacity="0.28">
            <circle cx="180" cy="176" r="78" strokeWidth="1" />
            <circle cx="180" cy="176" r="58" strokeWidth="1" />
            <line x1="180" y1="90" x2="180" y2="262" strokeWidth="0.75" />
            <line x1="94" y1="176" x2="266" y2="176" strokeWidth="0.75" />
          </g>
          <polygon
            points="180,110 192,176 180,242 168,176"
            fill="#ffffff"
            opacity="0.9"
          />
          <circle cx="180" cy="176" r="5" fill={familyColor} stroke="#ffffff" strokeWidth="2" />

          {/* 品牌 */}
          <text x="180" y="52" textAnchor="middle" fill="#ffffff" fontSize="13" opacity="0.8" letterSpacing="1">
            向内求索 · InnerQuest
          </text>

          {/* 类型码 */}
          <text
            x="180"
            y="330"
            textAnchor="middle"
            fill="#ffffff"
            fontSize="76"
            fontWeight="900"
            letterSpacing="8"
            fontFamily="'JetBrains Mono', monospace"
          >
            {report.mbtiType}
          </text>
          <text x="180" y="362" textAnchor="middle" fill="#ffffff" fontSize="15" opacity="0.92">
            {FAMILY_LABEL[report.family]}
          </text>

          {/* 摘要 */}
          {summaryLines.map((line, i) => (
            <text
              key={i}
              x="180"
              y={402 + i * 22}
              textAnchor="middle"
              fill="#ffffff"
              fontSize="12.5"
              opacity="0.82"
            >
              {line}
            </text>
          ))}

          {/* 四维度简况色块 */}
          {report.dimensions.map((d, i) => (
            <g key={d.dimension}>
              <rect
                x={64 + i * 62}
                y="474"
                width="48"
                height="6"
                rx="3"
                fill="#ffffff"
                opacity={0.35 + (Math.abs(d.score - 50) / 50) * 0.55}
              />
              <text
                x={88 + i * 62}
                y="496"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="10"
                opacity="0.72"
                fontFamily="'JetBrains Mono', monospace"
              >
                {d.dimension}
              </text>
            </g>
          ))}

          <text x="180" y="522" textAnchor="middle" fill="#ffffff" fontSize="10.5" opacity="0.6">
            扫码测测你是谁
          </text>
        </svg>
      </Reveal>

      {/* 数据速览 */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <GroupBadge mbtiType={report.mbtiType} size="md" />
        {report.dimensions.slice(0, 2).map((d) => {
          const towardRight = d.score >= 50;
          const dominant = towardRight ? d.right : d.left;
          const strength = Math.round(Math.abs(d.score - 50) * 2);
          return (
            <StatPill
              key={d.dimension}
              tone="neutral"
              label={dominant}
              value={strength}
              suffix="%"
            />
          );
        })}
      </div>

      {/* 分享操作 */}
      <div className="mt-8 flex flex-col items-center gap-4">
        <SpringButton
          variant="accent"
          onClick={copyLink}
          disabled={share.isPending}
          className="w-64"
        >
          {copied ? '已复制链接 ✓' : share.isPending ? '生成中…' : '复制分享链接'}
        </SpringButton>
        <div className="flex w-full max-w-sm items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
          <span className="flex-1 truncate text-left font-mono text-xs text-neutral-500">
            {shareUrl}
          </span>
        </div>
        <button
          onClick={() => navigate(`/app/report/${id}`)}
          className="text-sm text-neutral-400 underline-offset-4 transition-colors hover:text-brand-primary-600 hover:underline"
        >
          返回报告
        </button>
      </div>
    </section>
  );
}