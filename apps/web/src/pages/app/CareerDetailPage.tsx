/**
 * P13 职业详情页
 * - 岗位职责 / 核心技能（DimensionBar 风格进度）/ 薪资阶梯 / 发展路径 / 适配人格
 * - 复用原子组件，反居中分栏，数据密集区增密，无数据回退 mock（hooks 层已兜底）
 */
import { useParams, useNavigate } from 'react-router-dom';
import { useCareerDetail } from '../../hooks/useCareer';
import { COLORS } from '../../theme/tokens';
import { CareerAiToolsTabs } from '../../components/ai/CareerAiToolsTabs';
import {
  Card,
  SectionHeading,
  StatPill,
  Tag,
  GroupBadge,
  Reveal,
  RevealItem,
  EmptyState,
  SpringButton,
  BackButton,
} from '../../components';

/** 薪资三档标签 */
const SALARY_TIERS = [
  { key: 'junior', label: '初级' },
  { key: 'middle', label: '中级' },
  { key: 'senior', label: '高级' },
] as const;

export function CareerDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: career, isLoading } = useCareerDetail(id);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <EmptyState
          icon="sparkle"
          title="职业详情加载中…"
          description="正在为你梳理岗位职责、技能画像与发展路径。"
        />
      </div>
    );
  }

  if (!career) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <EmptyState
          icon="search"
          title="未找到该职业"
          description="它可能已下线或链接有误，返回列表继续探索匹配方向。"
          action={
            <SpringButton variant="primary" onClick={() => navigate('/app/career')}>
              返回匹配列表
            </SpringButton>
          }
        />
      </div>
    );
  }

  const deps = [career.id];

  return (
    <article className="mx-auto max-w-4xl px-4 pb-20">
      {/* 返回 */}
      <BackButton to="/app/career" label="返回匹配列表" className="mt-6" />

      {/* 头部：非对称栅格，标题左 + 匹配度右 */}
      <Reveal deps={deps} className="mt-4">
        <Card padding="lg" className="grid grid-cols-1 gap-6 md:grid-cols-5">
          <div className="md:col-span-3">
            <span className="font-sans text-xs font-semibold uppercase tracking-wider text-brand-accent-600">
              {career.category}
            </span>
            <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-brand-primary-950 md:text-4xl">
              {career.title}
            </h1>
            <p className="mt-3 max-w-xl font-serif text-lg leading-relaxed text-neutral-600">
              {career.summary}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {career.tags.map((t) => (
                <Tag key={t} tone="brand" size="sm">
                  {t}
                </Tag>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-start justify-center gap-3 md:col-span-2 md:items-end">
            {career.matchScore != null && (
              <StatPill
                tone="accent"
                label="匹配度"
                value={career.matchScore}
                suffix="%"
              />
            )}
            {career.salaryRange && (
              <StatPill tone="neutral" label="薪资" value={career.salaryRange} />
            )}
          </div>
        </Card>
      </Reveal>

      {/* 主体：左主内容 + 右侧信息栏 */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* 左：职责 + 技能 */}
        <div className="space-y-8 lg:col-span-2">
          {/* 岗位职责 */}
          <section>
            <SectionHeading as="h2" size="md" eyebrow="Responsibilities" title="岗位职责" />
            <Reveal deps={deps} className="mt-4 space-y-2.5">
              {career.responsibilities.map((r, i) => (
                <RevealItem
                  key={r}
                  index={i}
                  className="flex items-start gap-3 rounded-xl border border-neutral-200/70 bg-white px-4 py-3"
                >
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: COLORS.brand }}
                  />
                  <span className="text-sm leading-relaxed text-neutral-700">{r}</span>
                </RevealItem>
              ))}
            </Reveal>
          </section>

          {/* 核心技能 */}
          <section>
            <SectionHeading as="h2" size="md" eyebrow="Skills" title="核心技能画像" />
            <Reveal deps={deps} className="mt-4 space-y-4">
              {career.skills.map((s) => (
                <div key={s.name}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-neutral-700">{s.name}</span>
                    <span className="font-mono tabular-nums text-neutral-500">{s.level}%</span>
                  </div>
                  <div
                    className="dimension-bar h-2.5 overflow-hidden rounded-full bg-neutral-100"
                    data-reveal
                    style={{ ['--dimension-bar-target' as string]: `${s.level}%` }}
                  >
                    <div
                      className="dimension-bar__fill h-full rounded-full"
                      style={{ backgroundColor: COLORS.brand }}
                    />
                  </div>
                </div>
              ))}
            </Reveal>
          </section>
        </div>

        {/* 右：薪资 + 发展路径 + 适配人格 */}
        <aside className="space-y-8">
          {/* 薪资阶梯 */}
          <section>
            <SectionHeading as="h2" size="md" eyebrow="Salary" title="薪资参考" />
            <Reveal deps={deps} className="mt-4 space-y-2.5">
              {SALARY_TIERS.map(({ key, label }, i) => (
                <RevealItem
                  key={key}
                  index={i}
                  className="flex items-center justify-between rounded-xl border border-neutral-200/70 bg-white px-4 py-3"
                >
                  <span className="text-sm text-neutral-500">{label}</span>
                  <span
                    className="font-mono text-sm font-semibold tabular-nums"
                    style={{ color: COLORS.accent }}
                  >
                    {career.salary[key]}
                  </span>
                </RevealItem>
              ))}
            </Reveal>
          </section>

          {/* 发展路径 */}
          <section>
            <div className="flex items-center justify-between gap-3">
              <SectionHeading as="h2" size="md" eyebrow="Path" title="发展路径" />
              <button
                onClick={() => navigate(`/app/career/${id}/roadmap`)}
                className="shrink-0 text-sm font-medium text-brand-primary-500 hover:text-brand-primary-600"
              >
                完整路线图 →
              </button>
            </div>
            <Reveal deps={deps} className="mt-4 flex flex-col gap-2">
              {career.growthPath.map((p, i) => (
                <div key={p} className="flex items-center gap-3">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold text-white"
                    style={{ backgroundColor: COLORS.brand }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm text-neutral-700">{p}</span>
                </div>
              ))}
            </Reveal>
          </section>

          {/* 适配人格 */}
          <section>
            <SectionHeading as="h2" size="md" eyebrow="Fit" title="适配人格类型" />
            <div className="mt-4 flex flex-wrap gap-2">
              {career.fitTypes.map((t) => (
                <GroupBadge key={t} mbtiType={t} size="sm" showLabel={false} />
              ))}
            </div>
          </section>
        </aside>
      </div>

      <CareerAiToolsTabs careerId={id} />
    </article>
  );
}