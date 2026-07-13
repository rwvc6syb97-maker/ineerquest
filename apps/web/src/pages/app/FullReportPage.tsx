/**
 * P09 完整报告页（/app/report/:id/full）
 * -------------------------------------------------------------
 * 解锁后的完整人格报告：不再对 locked 段做模糊遮罩，而是完整呈现所有 sections。
 *  头图族群色主卡（TypeAvatar + GroupBadge）→ 开篇寄语(Quote)
 *  → 四维度雷达图(RadarChart) + DimensionBar → 全量性格解读卡片
 *  → TOP 职业匹配列表（有 matchScore 数据则展示，否则引导跳 /app/career）。
 * 数据 hook 复用 useReport(id)；加载/错误/空态用 EmptyState 兜底，风格对齐 ReportPage.tsx。
 * 路由挂 report/:id/full，外层由 RequirePaid 守卫（见 routes.tsx）。
 */
import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useReport } from '../../hooks/useReport';
import { useRecommendCareers } from '../../hooks/useCareer';
import { RadarChart } from '../../components/charts/DimensionCharts';
import {
  GlassCard,
  Card,
  Tag,
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
import { FAMILY_COLORS, FAMILY_LABEL, COLORS } from '../../theme/tokens';
import { ReportChapterBlock } from '../../components/ai/ReportChapterBlock';

/** dimensions{dimension,...} → DimensionBar 的可读中文维度名 */
const DIM_LABEL: Record<string, string> = {
  EI: '能量来源',
  SN: '信息获取',
  TF: '决策方式',
  JP: '生活态度',
};

export function FullReportPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: report, isLoading, isError } = useReport(id);
  // TOP 职业匹配（复用推荐 hook，无后端时回退 mock）
  const { data: careers = [] } = useRecommendCareers(id);

  const dims = report?.dimensions ?? [];
  const topDim = useMemo(() => {
    if (!dims.length) return null;
    return dims.reduce((a, b) =>
      Math.abs(b.score - 50) > Math.abs(a.score - 50) ? b : a,
    );
  }, [dims]);

  const topCareers = useMemo(
    () => [...careers].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0)).slice(0, 5),
    [careers],
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
          description="还没有可展示的完整报告。先完成一次测评并解锁完整版，我们会为你生成专属的人格深度解读。"
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
  // P09：解锁后完整呈现所有 sections（不做锁态遮罩）
  const sections = report.sections;

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
              <TypeAvatar mbtiType={report.mbtiType} size={160} />
            </div>
            <div className="animate-fadeUp" style={{ animationDelay: '80ms' }}>
              <GroupBadge mbtiType={report.mbtiType} size="lg" />
            </div>
          </div>

          <div className="md:col-span-8">
            <span
              className="animate-fadeUp font-sans text-sm font-semibold uppercase tracking-wider"
              style={{ color }}
            >
              完整人格报告 · 已解锁
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

      {/* ============ 完整性格解读 · 全量 sections ============ */}
      <section className="mt-14">
        <SectionHeading size="md" eyebrow="FULL INSIGHT" title="完整性格解读" />
        <Reveal className="mt-6 grid grid-cols-1 gap-5" deps={[report.id]}>
          {sections.map((s, i) => (
            <RevealItem key={s.sectionKey} index={i}>
              <Card padding="lg">
                <h3 className="flex items-center gap-2 font-display text-xl font-bold text-brand-primary-950">
                  <span className="h-5 w-1.5 rounded-full" style={{ background: color }} />
                  {s.title}
                </h3>
                <p className="mt-4 leading-relaxed text-neutral-700">
                  {s.content || '深度解读你的职业倾向、协作风格与关系模式，帮助你把人格优势转化为现实选择。'}
                </p>
              </Card>
            </RevealItem>
          ))}
        </Reveal>
      </section>

      {/* ============ TOP 职业匹配 ============ */}
      <section className="mt-14">
        <SectionHeading
          size="md"
          eyebrow="CAREER MATCH"
          title="与你高度匹配的职业"
          subtitle="根据你的人格倾向排出的匹配 TOP 榜单。"
        />
        {topCareers.length ? (
          <Reveal className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2" deps={[report.id]}>
            {topCareers.map((c, i) => {
              const score = c.matchScore ?? 0;
              return (
                <RevealItem key={c.id} index={i}>
                  <Card
                    padding="md"
                    interactive
                    onClick={() => navigate(`/app/career/${c.id}`)}
                    className="flex h-full cursor-pointer flex-col"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-display text-lg font-bold text-brand-primary-950">
                          {c.title}
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
                    <p className="mt-3 text-sm leading-relaxed text-neutral-600">{c.summary}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {c.salaryRange ? <StatPill value={c.salaryRange} tone="accent" /> : null}
                      {c.tags.map((t) => (
                        <Tag key={t} tone="neutral" size="sm">
                          {t}
                        </Tag>
                      ))}
                    </div>
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
                  onClick={() => navigate(`/app/career?reportId=${report.id}&mbti=${report.mbtiType}`)}
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
          <SpringButton variant="ghost" onClick={() => navigate(`/app/report/${report.id}/share`)}>
            生成分享海报
          </SpringButton>
        </div>
      </section>
    </article>
  );
}

export default FullReportPage;