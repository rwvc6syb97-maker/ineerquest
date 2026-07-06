/**
 * P18 职业路线图页（/app/career/:careerId/roadmap）
 * -------------------------------------------------------------
 * 以时间轴形式展示目标职业的成长阶段（growthPath）+ 各阶段薪资锚点、
 * 所需核心技能与匹配人格。复用 useCareerDetail（含 mock 兜底）。
 */
import { useParams } from 'react-router-dom';
import { useCareerDetail } from '../../hooks/useCareer';
import {
  Card,
  Tag,
  StatPill,
  SectionHeading,
  Reveal,
  RevealItem,
  EmptyState,
  BackButton,
  SpringLink,
} from '../../components';
import { COLORS } from '../../theme/tokens';

/** 阶段薪资锚点：按阶段序号映射 junior/middle/senior */
function salaryFor(
  salary: { junior: string; middle: string; senior: string },
  index: number,
  total: number,
): string {
  if (total <= 1) return salary.middle;
  const ratio = index / (total - 1);
  if (ratio < 0.34) return salary.junior;
  if (ratio < 0.67) return salary.middle;
  return salary.senior;
}

export function CareerRoadmapPage() {
  const { careerId = '' } = useParams();
  const { data: career, isLoading } = useCareerDetail(careerId);

  if (isLoading) {
    return <p className="py-16 text-center font-serif text-neutral-400">加载路线图…</p>;
  }
  if (!career) {
    return (
      <div className="py-16">
        <EmptyState
          icon="compass"
          title="暂无该职业的路线图"
          description="换一个职业，或先浏览职业库找到感兴趣的方向。"
          action={
            <SpringLink to="/app/careers/wiki" variant="primary">
              去职业百科
            </SpringLink>
          }
        />
      </div>
    );
  }

  const stages = career.growthPath ?? [];

  return (
    <article className="mx-auto max-w-4xl pb-20">
      <div className="mb-4">
        <BackButton to={`/app/career/${career.id}`} label="返回职业详情" />
      </div>

      <SectionHeading
        size="lg"
        eyebrow="ROADMAP"
        title={`${career.title} · 成长路线图`}
        subtitle="从入门到资深，看清每个阶段的定位、薪资锚点与需要积累的能力。"
      />

      {/* 概览药丸 */}
      <div className="mt-6 flex flex-wrap gap-2">
        <StatPill label="所属" value={career.category} tone="neutral" />
        {career.matchScore != null ? (
          <StatPill label="匹配度" value={career.matchScore} suffix="分" tone="accent" />
        ) : null}
        {career.salaryRange ? (
          <StatPill label="薪资" value={career.salaryRange} tone="brand" />
        ) : null}
      </div>

      {/* 阶段时间轴 */}
      {stages.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon="compass"
            title="暂无阶段数据"
            description="该职业的成长阶段尚未整理，敬请期待。"
          />
        </div>
      ) : (
        <Reveal className="mt-10" deps={[career.id]}>
          <ol className="relative ml-3 border-l-2 border-neutral-200">
            {stages.map((stage, i) => (
              <RevealItem key={stage} index={i} as="li">
                <div className="relative pb-8 pl-8">
                  {/* 节点圆点 */}
                  <span
                    className="absolute -left-[9px] top-1.5 h-4 w-4 rounded-full border-2 border-white shadow"
                    style={{ backgroundColor: COLORS.brand }}
                    aria-hidden
                  />
                  <Card padding="md" className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-neutral-400">
                          阶段 {i + 1}
                        </span>
                        <h3 className="font-display text-lg font-bold text-brand-primary-950">
                          {stage}
                        </h3>
                      </div>
                      <StatPill
                        value={salaryFor(career.salary, i, stages.length)}
                        tone="brand"
                      />
                    </div>
                    {/* 该阶段建议积累的核心技能（取技能前若干项） */}
                    <div className="flex flex-wrap gap-1.5">
                      {career.skills.slice(0, Math.min(3 + i, career.skills.length)).map((s) => (
                        <Tag key={s.name} tone="neutral" size="sm">
                          {s.name}
                        </Tag>
                      ))}
                    </div>
                  </Card>
                </div>
              </RevealItem>
            ))}
          </ol>
        </Reveal>
      )}

      {/* 关联行动 */}
      <div className="mt-8 flex flex-wrap gap-3">
        <SpringLink to={`/app/skills-gap/${career.id}`} variant="primary">
          查看技能差距
        </SpringLink>
        <SpringLink to="/app/learning/resources" variant="ghost">
          学习资源
        </SpringLink>
      </div>

      {/* 匹配人格提示 */}
      {career.fitTypes?.length ? (
        <p className="mt-8 text-sm text-neutral-500">
          与该职业契合的人格类型：
          <span className="ml-1 font-medium text-brand-primary-700">
            {career.fitTypes.join(' · ')}
          </span>
        </p>
      ) : null}
    </article>
  );
}

export default CareerRoadmapPage;