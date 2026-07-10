/**
 * P08 人格报告页（/app/report/:id）
 * -------------------------------------------------------------
 * 精致化重构：族群色头图（GlassCard 悬浮主卡）+ TypeAvatar 意象 + GroupBadge
 *  → serif 开篇寄语(Quote) → 四维度 DimensionBar 一次性填充 + 雷达图(RadarChart)
 *  → 性格解读（优势/盲点非对称分栏 + 锁态付费段）→ 匹配度 StatPill
 *  → 底部「查看职业匹配」「生成海报」CTA（SpringButton 橙）。
 * 设计约束：GlassCard 仅用于报告主卡这一高价值场景；数据揭示克制、含 reduced-motion 降级。
 * 数据 hook（useReport）直连后端 v2.1 出参，无 mock 兜底；失败态由 isError 呈现。
 */
import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useReport } from '../../hooks/useReport';
import { reportApi } from '../../api';
import { RadarChart } from '../../components/charts/DimensionCharts';
import {
  GlassCard,
  Card,
  GroupBadge,
  TypeAvatar,
  DimensionBar,
  Quote,
  StatPill,
  SectionHeading,
  Reveal,
  RevealItem,
  EmptyState,
  SpringButton,
  BackButton,
} from '../../components';
import { FAMILY_COLORS, FAMILY_LABEL } from '../../theme/tokens';

/** dimensions{dimension,left,right,score} → DimensionBar props；label 用可读中文维度名 */
const DIM_LABEL: Record<string, string> = {
  EI: '能量来源',
  SN: '信息获取',
  TF: '决策方式',
  JP: '生活态度',
};

export function ReportPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: report, isLoading, isError, refetch } = useReport(id);

  // —— PDF 导出 ——
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // —— B7：深度报告生成（generateStatus=pending 时触发 LLM 深度生成） ——
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!report || generating) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      await reportApi.generateDeepContent(report.id);
      // 触发后刷新报告以拉取最新 generateStatus / 章节内容
      await refetch();
    } catch {
      setGenerateError('生成失败，请稍后重试');
      window.setTimeout(() => setGenerateError(null), 2600);
    } finally {
      setGenerating(false);
    }
  };

  const dims = report?.dimensions ?? [];
  const topDim = useMemo(() => {
    if (!dims.length) return null;
    return dims.reduce((a, b) =>
      Math.abs(b.score - 50) > Math.abs(a.score - 50) ? b : a,
    );
  }, [dims]);

  if (isLoading) {
    return (
      <p className="py-16 text-center font-serif text-neutral-400">报告生成中…</p>
    );
  }
  if (isError || !report) {
    return (
      <div className="py-16">
        <EmptyState
          icon="sparkle"
          title="暂无报告数据"
          description="还没有可展示的报告。先完成一次测评，我们会为你生成专属的人格解读。"
          action={
            <SpringButton variant="accent" onClick={() => navigate('/assessment')}>
              去做测评
            </SpringButton>
          }
        />
      </div>
    );
  }

  const color = FAMILY_COLORS[report.family];
  // 锁态以后端下发的 lockedSectionKeys 为准（概览接口不返回 isFree）
  const lockedKeys = new Set(report.lockedSectionKeys ?? []);
  const unlocked = report.sections.filter((s) => !lockedKeys.has(s.sectionKey));
  const strength = unlocked.find((s) => /优势|长处|strength/i.test(s.sectionKey + s.title));
  const blindspot = unlocked.find((s) => /盲点|成长|blind|growth/i.test(s.sectionKey + s.title));
  const others = unlocked.filter((s) => s !== strength && s !== blindspot);
  const lockedSections = report.sections.filter((s) => lockedKeys.has(s.sectionKey));

  const hasLocked = lockedSections.length > 0;

  const handleExport = async () => {
    if (hasLocked || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const blob = await reportApi.exportReport(report.id);
      const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
      a.href = url;
      a.download = `InnerQuest-报告-${report.mbtiType}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('导出失败，请稍后重试');
      window.setTimeout(() => setExportError(null), 2600);
    } finally {
      setExporting(false);
    }
  };

  return (
    <article className="mx-auto max-w-5xl pb-20">
      {/* 返回上一级 + PDF 导出 */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <BackButton to="/app" label="返回概览" />
        <SpringButton
          variant="ghost"
          onClick={handleExport}
          disabled={hasLocked || exporting}
          title={hasLocked ? '解锁完整报告后可导出' : undefined}
        >
          {exporting ? '导出中…' : hasLocked ? '解锁后可导出' : '导出 PDF'}
        </SpringButton>
      </div>
     {/* ============ 头图 · 玻璃拟态主卡（非对称分栏） ============ */}
      <header className="relative overflow-hidden rounded-3xl">
        {/* 族群色氛围底 */}
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(135deg, ${color}1f, #ffffff 72%)` }}
          aria-hidden
        />
        <GlassCard
          padding="lg"
          className="relative grid grid-cols-1 items-center gap-8 md:grid-cols-12"
        >
          {/* 左：意象 + 徽章 */}
          <div className="flex flex-col items-center gap-4 md:col-span-4 md:items-start">
            <div className="animate-fadeUp rounded-3xl p-5" style={{ background: `${color}12` }}>
              <TypeAvatar mbtiType={report.mbtiType} size={160} />
            </div>
            <div className="animate-fadeUp" style={{ animationDelay: '80ms' }}>
              <GroupBadge mbtiType={report.mbtiType} size="lg" />
            </div>
          </div>

          {/* 右：类型码 + 开篇寄语 */}
          <div className="md:col-span-8">
            <span
              className="animate-fadeUp font-sans text-sm font-semibold uppercase tracking-wider"
              style={{ color }}
            >
              你的人格报告
            </span>
            <h1
              className="mt-2 animate-fadeUp font-display text-5xl font-black tracking-tight text-brand-primary-950 md:text-6xl"
              style={{ animationDelay: '80ms' }}
            >
              {report.mbtiType}
              <span className="ml-3 align-middle font-sans text-lg font-medium text-neutral-400">
                {FAMILY_LABEL[report.family]}
              </span>
            </h1>
            <div className="mt-5 animate-fadeUp" style={{ animationDelay: '160ms' }}>
              <Quote size="md" className="text-left">
                {report.summary}
              </Quote>
            </div>
            {topDim ? (
              <div className="mt-6 flex animate-fadeUp flex-wrap gap-3" style={{ animationDelay: '240ms' }}>
                <StatPill
                  label="最鲜明倾向"
                  value={topDim.score >= 50 ? topDim.right : topDim.left}
                  color={color}
                />
                <StatPill
                  label="强度"
                  value={`${Math.round(Math.abs(topDim.score - 50) * 2)}`}
                  suffix="%"
                  color={color}
                />
              </div>
            ) : null}
          </div>
        </GlassCard>
      </header>

      {/* ============ B7 · 深度报告生成引导（generateStatus=pending） ============ */}
      {report.generateStatus === 'pending' ? (
        <section className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-brand-accent-300 bg-brand-accent-50 px-6 py-8 text-center">
          <h2 className="font-display text-xl font-bold text-brand-primary-950">
            深度报告尚未生成
          </h2>
          <p className="max-w-md font-serif text-sm text-neutral-600">
            我们已为你准备好个性化的深度解读，点击下方按钮开始生成，稍等片刻即可查看完整内容。
          </p>
          <SpringButton variant="accent" onClick={handleGenerate} disabled={generating}>
            {generating ? '生成中…' : '生成深度报告'}
          </SpringButton>
          {generateError ? (
            <span className="text-sm text-red-600">{generateError}</span>
          ) : null}
        </section>
      ) : report.generateStatus === 'generating' ? (
        <section className="mt-8 rounded-2xl border border-neutral-200 bg-neutral-50 px-6 py-6 text-center">
          <p className="font-serif text-sm text-neutral-600">
            深度报告正在生成中，请稍后刷新查看。
          </p>
          <SpringButton variant="ghost" className="mt-3" onClick={() => refetch()}>
            刷新
          </SpringButton>
        </section>
      ) : null}
      <section className="mt-14 grid grid-cols-1 items-center gap-8 md:grid-cols-12">
        <div className="md:col-span-5">
          <SectionHeading
            title="你的四维度倾向"
            subtitle="每一维都是一段光谱，而非非此即彼的开关。"
          />
          <div className="mt-6 flex justify-center md:justify-start">
            <RadarChart data={dims} color={color} />
          </div>
        </div>
        <div className="md:col-span-7">
          <Reveal className="space-y-5" deps={[report.id]}>
            {dims.map((d) => (
              <DimensionBar
                key={d.dimension}
                label={DIM_LABEL[d.dimension] ?? d.dimension}
                leftPole={d.left}
                rightPole={d.right}
                value={d.score}
                dimensionColor={color}
              />
            ))}
          </Reveal>
        </div>
      </section>

      {/* ============ 性格解读 · 优势/盲点非对称分栏 ============ */}
      <section className="mt-14">
        <SectionHeading size="md" eyebrow="INSIGHT" title="性格解读" />
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-5">
          {strength ? (
            <Card padding="lg" className="md:col-span-3">
              <h3 className="flex items-center gap-2 font-display text-xl font-bold text-brand-primary-950">
                <span className="h-5 w-1.5 rounded-full" style={{ background: color }} />
                {strength.title}
              </h3>
              <p className="mt-4 leading-relaxed text-neutral-700">{strength.content}</p>
            </Card>
          ) : null}
          {blindspot ? (
            <Card padding="lg" className="md:col-span-2">
              <h3 className="flex items-center gap-2 font-display text-xl font-bold text-brand-primary-950">
                <span className="h-5 w-1.5 rounded-full bg-neutral-300" />
                {blindspot.title}
              </h3>
              <p className="mt-4 leading-relaxed text-neutral-600">{blindspot.content}</p>
            </Card>
          ) : null}
          {others.map((s) => (
            <Card key={s.sectionKey} padding="lg" className="md:col-span-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-lg font-bold text-brand-primary-950">{s.title}</h3>
                <button
                  onClick={() => navigate(`/app/report/${report.id}/section/${s.sectionKey}`)}
                  className="shrink-0 text-sm font-medium text-brand-primary-500 hover:text-brand-primary-600"
                >
                  查看详情 →
                </button>
              </div>
              <p className="mt-3 leading-relaxed text-neutral-700">{s.content}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ============ 付费锁态段 ============ */}
      {lockedSections.length ? (
        <section className="mt-8">
          <Reveal className="grid grid-cols-1 gap-5 sm:grid-cols-2" deps={[report.id]}>
            {lockedSections.map((s, i) => (
              <RevealItem key={s.sectionKey} index={i}>
                <div className="relative overflow-hidden rounded-2xl border border-dashed border-neutral-300 p-6">
                  <div className="pointer-events-none select-none blur-sm" aria-hidden>
                    <h3 className="font-display text-base font-bold text-neutral-800">{s.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                      深度解读你的职业倾向、协作风格与关系模式，帮助你把人格优势转化为现实选择……
                    </p>
                  </div>
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70">
                    <span className="font-sans text-sm font-semibold text-neutral-700">
                      {s.title} · 已锁定
                    </span>
                    <SpringButton variant="accent" onClick={() => navigate('/pricing?reportId=' + report.id)}>
                      解锁完整报告
                    </SpringButton>
                  </div>
                </div>
              </RevealItem>
            ))}
          </Reveal>
        </section>
      ) : null}

      {/* ============ 行动区 CTA ============ */}
      <section className="mt-14 flex flex-col items-center gap-4 rounded-3xl bg-neutral-50 px-6 py-12 text-center">
        <h2 className="font-display text-2xl font-bold text-brand-primary-950">
          把人格优势，转化为现实选择
        </h2>
        <p className="max-w-md font-serif text-neutral-600">
          看看与「{report.mbtiType}」高度匹配的职业方向，或把这张人格名片分享给朋友。
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <SpringButton
            variant="accent"
            onClick={() =>
              navigate(`/app/career?reportId=${report.id}&mbti=${report.mbtiType}`)
            }
          >
            查看职业匹配
          </SpringButton>
          <SpringButton variant="ghost" onClick={() => navigate(`/app/report/${report.id}/share`)}>
            生成分享海报
          </SpringButton>
          <SpringButton variant="ghost" onClick={handleExport} disabled={hasLocked || exporting}>
            {exporting ? '导出中…' : hasLocked ? '解锁后可导出' : '导出 PDF'}
          </SpringButton>
        </div>
      </section>

      {/* 导出错误 toast */}
      {exportError ? (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
          {exportError}
        </div>
      ) : null}
    </article>
  );
}

export default ReportPage;