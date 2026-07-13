import { useState } from 'react';
import {
  Card,
  SectionHeading,
  SpringButton,
  Tag,
  EmptyState,
} from '../../components';
import { useReportChapter } from '../../hooks/useAiPlus';
import type { ReportChapterFocus } from '../../api/modules/ai-plus.api';

const COLORS = { accent: '#f97316' } as const;

const FOCUS_OPTIONS: { value: ReportChapterFocus; label: string }[] = [
  { value: 'career', label: '职业发展' },
  { value: 'relationship', label: '人际关系' },
  { value: 'growth', label: '自我成长' },
  { value: 'leadership', label: '领导力' },
];

interface ReportChapterBlockProps {
  /** 归属报告 id。 */
  reportId: string;
  /** 关联职业 id（可选，focus=career 时透传）。 */
  focusCareerId?: string;
}

/** amber 引导提示条。 */
function GuideNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      {children}
    </div>
  );
}

/**
 * P2-3 深度报告扩展章节生成块（DEEP 报告专享）。
 * 选择聚焦方向 → run → 渲染 title/paragraphs；4517 引导解锁深度报告；degraded 角标。
 */
export function ReportChapterBlock({ reportId, focusCareerId }: ReportChapterBlockProps) {
  const { data, loading, error, deepOnly, degraded, run } = useReportChapter();
  const [focus, setFocus] = useState<ReportChapterFocus>('career');

  const handleGenerate = () => {
    if (!reportId) return;
    run({
      reportId,
      focus,
      ...(focus === 'career' && focusCareerId ? { focusCareerId } : {}),
    });
  };

  return (
    <section className="mt-12 border-t border-neutral-200/70 pt-10">
      <SectionHeading
        eyebrow="Deep Report"
        title="深度扩展章节"
        subtitle="为深度报告生成聚焦某一主题的延展解读。"
        size="md"
        as="h2"
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {FOCUS_OPTIONS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFocus(f.value)}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${
          focus === f.value
                ? 'border-transparent bg-neutral-900 text-white'
                : 'border-neutral-300 text-neutral-600 hover:border-neutral-400'
            }`}
          >
            {f.label}
          </button>
        ))}
        <SpringButton variant="accent" onClick={handleGenerate} disabled={loading}>
          {loading ? '生成中…' : '生成章节'}
        </SpringButton>
      </div>

      {deepOnly && (
        <GuideNotice>
          深度扩展章节为深度报告专享，
          <a href="/pricing" className="font-semibold underline">
            解锁深度报告
          </a>
          后即可为报告生成延展解读。
        </GuideNotice>
      )}

      {error && !deepOnly && (
        <div className="mt-4 rounded-xl border border-red-300/70 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data ? (
        <Card padding="lg" className="mt-5">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-neutral-900">{data.title}</h3>
            {degraded && <Tag>降级生成</Tag>}
          </div>
          {data.paragraphs.length > 0 ? (
            <div className="mt-3 space-y-3">
              {data.paragraphs.map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-neutral-700">
                  {p}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-neutral-400">暂无章节内容。</p>
          )}
        </Card>
      ) : (
        !loading &&
        !error && (
          <div className="mt-6">
            <EmptyState
              icon="sparkle"
              title="选择聚焦方向后生成"
              description="深度报告可按主题延展出更深入的个性化解读。"
            />
          </div>
        )
      )}

      <div className="mt-4">
        <Tag>
          <span style={{ color: COLORS.accent }}>●</span> 深度报告专享能力
        </Tag>
      </div>
    </section>
  );
}