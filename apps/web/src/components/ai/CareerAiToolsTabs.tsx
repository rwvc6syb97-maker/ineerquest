/**
 * 职业详情页「AI 增值工具」Tab 容器
 * -------------------------------------------------------------
 * 承载 P2-2 求职文书生成、P3-1/2 AI 面试练习两个会员专享工具。
 * 仅负责 Tab 切换与 careerId 透传，各工具的权限/配额/降级由内部 Block 各自处理。
 */
import { useState } from 'react';
import { SectionHeading } from '../../components';
import { ResumeGenerateBlock } from './ResumeGenerateBlock';
import { InterviewPracticeBlock } from './InterviewPracticeBlock';

interface CareerAiToolsTabsProps {
  /** 目标职业 id（来自 CareerDetailPage useParams）。 */
  careerId: string;
}

type ToolTab = 'resume' | 'interview';

const TABS: { key: ToolTab; label: string }[] = [
  { key: 'resume', label: '求职文书' },
  { key: 'interview', label: '模拟面试' },
];

export function CareerAiToolsTabs({ careerId }: CareerAiToolsTabsProps) {
  const [tab, setTab] = useState<ToolTab>('resume');

  return (
    <section className="mt-12 border-t border-neutral-200/70 pt-10">
      <SectionHeading
        eyebrow="AI TOOLKIT"
        title="AI 求职增值工具"
        subtitle="面向该职业的会员专享工具：生成求职文书、模拟面试练习。"
      />

      {/* Tab 切换 */}
      <div className="mt-5 inline-flex rounded-lg border border-neutral-200 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-md px-5 py-1.5 text-sm transition ${
              tab === t.key
                ? 'bg-brand-primary-500 text-white'
                : 'text-neutral-600 hover:text-brand-primary-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 内容（挂载切换，各工具状态独立） */}
      <div className="mt-2">
        {tab === 'resume' ? (
          <ResumeGenerateBlock careerId={careerId} />
        ) : (
          <InterviewPracticeBlock careerId={careerId} />
        )}
      </div>
    </section>
  );
}

export default CareerAiToolsTabs;