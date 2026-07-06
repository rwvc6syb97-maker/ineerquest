/**
 * P16 技能差距分析页（/app/skills-gap/:careerId）
 * -------------------------------------------------------------
 * 展示目标职业所需技能 vs 用户当前水平的差距：
 *  - 雷达图（RadarChart，复用 DimItem 结构：以 currentLevel 映射 score）
 *  - 差距列表（require/current/gap 双进度条 + 提升建议）
 * 数据 hook useSkillGap，失败自动 mock fallback。
 */
import { useParams } from 'react-router-dom';
import { Card, Tag, SectionHeading, Reveal, RevealItem } from '../../components';
import { RadarChart, type DimItem } from '../../components';
import { COLORS } from '../../theme/tokens';
import { useSkillGap } from '../../hooks/useCareerPlan';

export function SkillsGapPage() {
  const { careerId = '' } = useParams();
  const { data, isLoading } = useSkillGap(careerId);

  // 将技能项映射为雷达图维度（score = 当前水平占要求的比例，居中在 50）
  const radarData: DimItem[] = (data?.items ?? []).map((it) => ({
    dimension: it.skillName,
    left: '欠缺',
    right: it.skillName,
    score: Math.round((it.currentLevel / (it.requireLevel || 100)) * 100),
  }));

  return (
    <section className="mx-auto max-w-5xl pb-12">
      <SectionHeading
        size="lg"
        eyebrow="SKILL GAP"
        title={data ? `${data.careerTitle} · 技能差距分析` : '技能差距分析'}
        subtitle="对照目标岗位所需能力，看清你的优势与待补齐的短板。"
      />

      {isLoading ? (
        <p className="mt-10 text-center text-sm text-neutral-400">分析中…</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-[300px_1fr]">
          {/* 雷达概览 */}
          <Card className="flex flex-col items-center justify-center gap-2 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
              能力覆盖概览
            </p>
            <RadarChart data={radarData} color={COLORS.brand} />
            <p className="text-center text-xs leading-relaxed text-neutral-500">
              外圈越靠近，说明该项越接近岗位要求。
            </p>
          </Card>

          {/* 差距明细 */}
          <Reveal className="flex flex-col gap-4">
            {(data?.items ?? []).map((it) => {
              const covered = Math.min(100, Math.round((it.currentLevel / (it.requireLevel || 100)) * 100));
              const critical = it.gapLevel >= 25;
              return (
                <RevealItem key={it.skillName}>
                  <Card className="p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-base font-semibold text-brand-primary-950">
                        {it.skillName}
                      </h3>
                      <Tag tone={critical ? 'accent' : 'neutral'}>
                        差距 {it.gapLevel}
                      </Tag>
                    </div>

                    {/* 双层进度：要求（底）+ 当前（前景） */}
                    <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-neutral-200"
                        style={{ width: `${it.requireLevel}%` }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${it.currentLevel}%`,
                          backgroundColor: critical ? COLORS.accent : COLORS.brand,
                          transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
                        }}
                      />
                    </div>
                    <div className="mt-1.5 flex justify-between text-xs text-neutral-400">
                      <span>当前 {it.currentLevel}</span>
                      <span>覆盖 {covered}%</span>
                      <span>要求 {it.requireLevel}</span>
                    </div>

                    {it.suggestion && (
                      <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm leading-relaxed text-neutral-600">
                        💡 {it.suggestion}
                      </p>
                    )}
                  </Card>
                </RevealItem>
              );
            })}
          </Reveal>
        </div>
      )}
    </section>
  );
}

export default SkillsGapPage;