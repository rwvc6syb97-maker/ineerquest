/**
 * P09 完整报告页（/app/report/:id/full）
 * -------------------------------------------------------------
 * M2 一致性改造：改用 GET /reports/:id/view（reportView）作为唯一渲染数据源，
 * 与 PDF 导出严格同源（所见即所得），不再混用 GET /reports/:id 概览或 mock 推荐。
 *  头图分组色主卡（TypeAvatar + GroupBadge）→ 四维度雷达 + 填充条
 *  → 全量性格解读 sections → TOP 职业匹配（reportView.careerMatches）。
 * 加载/错误/空态用 EmptyState 兜底；所有 data 字段做可选判空，避免字段缺失白屏。
 */
import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useReportView } from '../../hooks/useReport';
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
import { COLORS } from '../../theme/tokens';
import { ReportChapterBlock } from '../../components/ai/ReportChapterBlock';

/** dimension key → 可读中文维度名（后端已下发 label，此为兜底） */
const DIM_LABEL: Record<string, string> = {
  EI: '能量来源',
  SN: '信息获取',
  TF: '决策方式',
  JP: '生活态度',
};

export function FullReportPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
 const { data: report, isLoading, isError } = useReportView(id);

  // RadarChart 期望 {dimension,left,right,score}；由 reportView 维度映射（score=右极占比）
  const radarDims = useMemo(
    () =>
      (report?.dimensions ?? []).map((d) => {
        const parts = (d.label ?? '').split('/').map((s) => s.trim());
        return {
          dimension: d.dimension,
          left: parts[0] ?? d.leftKey,
          right: parts[1] ?? d.rightKey,
          score: Math.round(d.rightValue ?? 0),
        };
      }),
    [report],
  );

  // 最鲜明倾向：离 50 最远的维度
  const topDim = useMemo(() => {
    if (!radarDims.length) return null;
    return radarDims.reduce((a, b) =>
      Math.abs(b.score - 50) > Math.abs(a.score - 50) ? b : a,
    );
  }, [radarDims]);

  const careerMatches = useMemo(
    () => [...(report?.careerMatches ?? [])].sort((a, b) => a.rankNo - b.rankNo).slice(0, 5),
    [report],
  );

  if (isLoading) {
    return (
      <p className="py-16 text-center font-serif text-neutral-400">完整报告加载中…</p>
    );
  }
  if (isError || !report) {
    return (
      <div className="py-16">
        <EmptyState
          icon="sparkle"
          title="暂无报告数据"
          description="还没有可展示的完整报告。先完成一次测评并生成报告，我们会为你呈现专属的人格深度解读。"
          action={
            <SpringButton variant="accent" onClick={() => navigate('/assessment')}>
              去做测评
            </SpringButton>
          }
        />
      </div>
    );
  }

  // 后端下发的分组主题色（前端不得反解）；缺失时兜底品牌色
  const color = report.groupColor || COLORS.accent;
  const personalityType = report.personalityType || '';
  const groupName = report.groupName || '';
  const sections = report.sections ?? [];

  return (
    <article className="mx-auto max-w-5xl pb-20">
      {/* 返回上一级：回到报告概览 */}
      <BackButton to={`/app/report/${id}`} label="返回报告" className="mb-4" />
      {/* ============ 头图 · 玻璃拟态主卡 ============ */}
      <header className="relative overflow-hidden rounded-3xl">
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(135deg, ${color}1f, #ffffff 72%)` }}
          aria-hidden
        />
        <GlassCard
          padding="lg"
          className="relative grid grid-cols-1 items-center gap-8 md:grid-cols-12"
        >
          <div className="flex flex-col items-center gap-4 md:col-span-4 md:items-start">
            <div className="animate-fadeUp rounded-3xl p-5" style={{ background: `${color}12` }}>
              <TypeAvatar mbtiType={personalityType} size={160} />
            </div>
            <div className="animate-fadeUp" style={{ animationDelay: '80ms' }}>
              <GroupBadge mbtiType={personalityType} size="lg" />
            </div>
          </div>

          <div className="md:col-span-8">
            <span
              className="animate-fadeUp font-sans text-sm font-semibold uppercase tracking-wider"
              style={{ color }}
            >
              完整人格报告
            </span>
            <h1
              className="mt-2 animate-fadeUp font-display text-5xl font-black tracking-tight text-brand-primary-950 md:text-6xl"
              style={{ animationDelay: '80ms' }}
            >
              {personalityType}
              <span className="ml-3 align-middle font-sans text-lg font-medium text-neutral-400">
                {groupName}
              </span>
            </h1>
            {sections[0]?.content ? (
              <div className="mt-5 animate-fadeUp" style={{ animationDelay: '160ms' }}>
                <Quote size="md" className="text-left">
                  {sections[0].content}
                </Quote>
              </div>
            ) : null}
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

      {/* ============ 四维度倾向 · 雷达 + 填充条 ============ */}
      <section className="mt-14 grid grid-cols-1 items-center gap-8 md:grid-cols-12">
        <div className="md:col-span-5">
          <SectionHeading
            size="md"
            eyebrow="DIMENSIONS"
            title="你的四维度倾向"
            subtitle="每一维都是一段光谱，而非非此即彼的开关。"
          />
          <div className="mt-6 flex justify-center md:justify-start">
            <RadarChart data={radarDims} color={color} />
          </div>
        </div>
        <div className="md:col-span-7">
          <Reveal className="space-y-5" deps={[report.reportId]}>
          {(report.dimensions ?? []).map((d) => {
              const parts = (d.label ?? '').split('/').map((s) => s.trim());
              return (
                <DimensionBar
                  key={d.dimension}
                  label={DIM_LABEL[d.dimension] ?? d.label ?? d.dimension}
                  leftPole={parts[0] ?? d.leftKey}
                  rightPole={parts[1] ?? d.rightKey}
                  value={Math.round(d.rightValue ?? 0)}
                  dimensionColor={color}
                />
              );
            })}
          </Reveal>
        </div>
      </section>

      {/* ============ 完整性格解读 · 全量 sections ============ */}
      <section className="mt-14">
        <SectionHeading size="md" eyebrow="FULL INSIGHT" title="完整性格解读" />
        <Reveal className="mt-6 grid grid-cols-1 gap-5" deps={[report.reportId]}>
          {[...sections]
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((s, i) => (
              <RevealItem key={s.sectionKey} index={i}>
                <Card padding="lg">
                  <h3 className="flex items-center gap-2 font-display text-xl font-bold text-brand-primary-950">
                    <span className="h-5 w-1.5 rounded-full" style={{ background: color }} />
                    {s.title}
                  </h3>
                  <p className="mt-4 whitespace-pre-line leading-relaxed text-neutral-700">
                    {s.content || '深度解读你的职业倾向、协作风格与关系模式，帮助你把人格优势转化为现实选择。'}
                  </p>
                </Card>
              </RevealItem>
            ))}
        </Reveal>
      </section>

      {/* ============ TOP 职业匹配（reportView.careerMatches 同源） ============ */}
      <section className="mt-14">
        <SectionHeading
          size="md"
          eyebrow="CAREER MATCH"
          title="与你高度匹配的职业"
          subtitle="根据你的人格倾向排出的匹配 TOP 榜单。"
        />
        {careerMatches.length ? (
          <Reveal className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2" deps={[report.reportId]}>
            {careerMatches.map((c, i) => {
              const score = c.matchScore ?? 0;
              return (
                <RevealItem key={c.careerId} index={i}>
                  <Card
                    padding="md"
                    interactive
                    onClick={() => navigate(`/app/career/${c.careerId}`)}
               className="flex h-full cursor-pointer flex-col"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-display text-lg font-bold text-brand-primary-950">
                          {c.name}
                        </h3>
                        <span className="font-mono text-xs text-neutral-400">{c.category}</span>
                      </div>
                      <span
                        className="shrink-0 font-mono text-base font-semibold tabular-nums"
                        style={{ color: COLORS.accent }}
                      >
                        {score}%
                      </span>
                    </div>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${score}%`,
                          backgroundColor: COLORS.accent,
                          transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
                        }}
                      />
                    </div>
                    {c.reason ? (
                      <p className="mt-3 text-sm leading-relaxed text-neutral-600">{c.reason}</p>
                    ) : null}
                  </Card>
                </RevealItem>
              );
            })}
          </Reveal>
        ) : (
          <div className="mt-6">
            <EmptyState
              icon="search"
              title="暂无职业匹配数据"
              description="前往职业匹配页，查看与你人格类型契合的职业方向。"
              action={
                <SpringButton
                  variant="accent"
                  onClick={() => navigate(`/app/career?reportId=${report.reportId}&mbti=${personalityType}`)}
                >
                  查看职业匹配
                </SpringButton>
              }
            />
          </div>
        )}
      </section>

      {/* ============ 深度报告扩展章节（DEEP 专享）============ */}
      <ReportChapterBlock reportId={id} />

      {/* ============ 行动区 CTA ============ */}
      <section className="mt-14 flex flex-col items-center gap-4 rounded-3xl bg-neutral-50 px-6 py-12 text-center">
        <h2 className="font-display text-2xl font-bold text-brand-primary-950">
          把人格优势，转化为现实选择
        </h2>
        <p className="max-w-md font-serif text-neutral-600">
          制定一份专属成长计划，或把这张人格名片分享给朋友。
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <SpringButton variant="accent" onClick={() => navigate('/app/me/plan')}>
            我的成长计划
          </SpringButton>
          <SpringButton variant="ghost" onClick={() => navigate(`/app/report/${report.reportId}/share`)}>
            生成分享海报
          </SpringButton>
        </div>
      </section>
    </article>
  );
}

export default FullReportPage;