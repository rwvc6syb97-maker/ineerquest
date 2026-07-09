/**
 * P04 测评说明页（/assessment/intro）
 * -------------------------------------------------------------
 * - 说明测评规则（40 题 / 约 12 分钟 / 无对错）与注意事项
 * - 检测本地草稿：有则引导「继续上次」并提供续答页入口 P07
 * - 开始时创建记录并写入草稿 store（无后端时本地临时 recordId 兜底）
 *
 * 设计落点：
 * - 营销区留白呼吸（py-16~24），非对称 SectionHeading + Scroll-Reveal 错峰入场
 * - 唯一强调橙仅给「开始测评」CTA；蓝为主，深蓝信任条
 * - 复用 SectionHeading / Card / Reveal / RevealItem / SpringButton / StatPill
 */
import { useNavigate } from 'react-router-dom';
import { useAssessmentStore } from '../../stores/assessment.store';
import { useCreateRecord} from '../../hooks/useAssessment';
import { SpringButton } from '../../components/system/SpringButton';
import { Card, Reveal, RevealItem, SectionHeading, StatPill } from '../../components';

/** 三条测评规则（编号用 mono，符合「百分比/编号」字体约束） */
const RULES = [
  { no: '40', title: '40 道题目', desc: '覆盖 E/I、S/N、T/F、J/P 四个维度，均衡取样' },
  { no: '12', title: '约 12 分钟', desc: '凭第一直觉作答，无需反复权衡' },
  { no: '∞', title: '没有对错', desc: '答案只反映倾向，无好坏优劣之分' },
];

/** 注意事项：建立信任感、提升可读性 */
const NOTES = [
  '选择最贴近日常真实反应的选项，而非「理想中的自己」。',
  '答题进度会自动保存，随时可离开，回来后从断点续答。',
  '结果仅用于自我认知与职业规划参考，不作任何评判。',
];

export function IntroPage() {
  const navigate = useNavigate();
  const { hasDraft, setRecordId, reset } = useAssessmentStore();
  const createRecord = useCreateRecord();
  const draft = hasDraft();

  const start = async () => {
    if (!draft) reset();
    try {
      const record = await createRecord.mutateAsync('v2');
      setRecordId(record.id);
      navigate('/assessment/quiz');
    } catch {
      // 创建记录失败：不再本地兜底，错误提示交由 createRecord.isError 呈现，用户可重试
    }
  };

  return (
    <div className="py-16 md:py-24">
      {/* 眉标 + 非对称主标题 + serif 引导语 */}
      <Reveal>
        <SectionHeading
          as="h1"
          size="xl"
          align="asymmetric"
          eyebrow="MBTI 人格测评"
          title="开始你的向内求索"
          subtitle="了解真实的自己，是规划职业的第一步。接下来的十几分钟，请把注意力交还给内心。"
        />
      </Reveal>

      {/* 三条规则：错峰入场卡片，编号 mono */}
      <Reveal className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {RULES.map((r, i) => (
          <RevealItem key={r.title} index={i}>
            <Card padding="lg" className="h-full">
              <span className="font-mono text-3xl font-bold text-brand-primary-500">
                {r.no}
              </span>
              <h3 className="mt-3 font-display text-lg font-semibold text-brand-primary-950">
                {r.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-neutral-500">{r.desc}</p>
            </Card>
          </RevealItem>
        ))}
      </Reveal>

      {/* 注意事项：左侧引导语气，建立信任 */}
      <Reveal className="mt-12 md:ml-[8%] max-w-2xl">
        <RevealItem index={0}>
          <h2 className="font-display text-base font-semibold text-brand-primary-900">
            作答前，请留意
          </h2>
          <ul className="mt-4 space-y-3">
            {NOTES.map((note, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-neutral-600">
                <span
                  className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-brand-primary-400"
                  aria-hidden="true"
                />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </RevealItem>
      </Reveal>

      {/* CTA 区：唯一强调橙 */}
      <Reveal className="mt-14 md:ml-[8%]">
        <RevealItem index={0} className="flex flex-col items-start gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <SpringButton
              variant="accent"
              onClick={start}
              disabled={createRecord.isPending}
              className="w-56 shadow-primary"
            >
              {createRecord.isPending ? '准备中…' : draft ? '继续上次测评' : '开始测评'}
            </SpringButton>
            {draft && (
              <StatPill label="已有草稿" value="可续答" tone="brand" />
            )}
          </div>
          {createRecord.isError && (
            <p className="text-sm text-brand-accent-600">
              测评启动失败，请检查网络后重试。
            </p>
          )}
          {draft && (
            <div className="flex items-center gap-4 text-xs text-neutral-400">
              <button
                onClick={() => navigate('/assessment/resume')}
                className="underline underline-offset-2 hover:text-brand-primary-500"
              >
                查看进度详情
              </button>
              <button
                onClick={() => {
                  reset();
                  void start();
                }}
                className="underline underline-offset-2 hover:text-brand-primary-500"
              >
                放弃草稿，重新开始
              </button>
            </div>
          )}
        </RevealItem>
      </Reveal>
    </div>
  );
}