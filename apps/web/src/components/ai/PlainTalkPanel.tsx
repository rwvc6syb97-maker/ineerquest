/**
 * L-P0-1 AI 报告人话解读面板
 * -------------------------------------------------------------
 * 内嵌于报告页：把专业化的报告解读翻译为「人话」，支持语气切换（warm/plain/pro）
 * 与按章节（sectionKey）翻译。
 *
 * 硬性红线（对齐 useAiPlus / ai-plus.api）：
 *  - 全走真实 usePlainTalk hook，禁止 mock 兜底掩盖契约。
 *  - degraded=true 时仍正常展示 plainText + 轻量降级提示，绝不白屏/报错弹窗。
 *  - 错误码分流：4203 报告不存在/无权、4302 章节已锁、4511 sectionKey 非法，
 *    文案优先后端 message，前端不硬编码业务报错文本。
 */
import { useState } from 'react';
import { usePlainTalk } from '../../hooks/useAiPlus';
import type { PlainTalkTone } from '../../api/modules/ai-plus.api';
import { Card } from '../ui/Card';
import { SectionHeading } from '../ui/SectionHeading';
import { SpringButton } from '../system/SpringButton';

/** 可翻译章节选项（sectionKey + 展示标题）。缺省整份报告翻译。 */
export interface PlainTalkSectionOption {
  sectionKey: string;
  title: string;
}

export interface PlainTalkPanelProps {
  /** 报告 id（string，来自 GET /reports/:id 的 id）。 */
  reportId: string;
  /** 可选章节列表；提供时展示章节选择器，缺省则整份翻译。 */
  sections?: PlainTalkSectionOption[];
  /** 主题色（族群色），用于按钮/高亮。 */
  accentColor?: string;
}

const TONE_OPTIONS: Array<{ value: PlainTalkTone; label: string; hint: string }> = [
  { value: 'warm', label: '温暖鼓励', hint: '像朋友一样为你打气' },
  { value: 'plain', label: '平实直白', hint: '不绕弯子说重点' },
  { value: 'pro', label: '专业理性', hint: '结构化的深度分析' },
];

/** 报告人话解读面板。 */
export function PlainTalkPanel({ reportId, sections = [], accentColor }: PlainTalkPanelProps) {
  const { data, loading, error, degraded, run, reset } = usePlainTalk();
  const [tone, setTone] = useState<PlainTalkTone>('warm');
  const [sectionKey, setSectionKey] = useState<string>('');

  const handleRun = () => {
    void run({
      reportId,
     tone,
      ...(sectionKey ? { sectionKey } : {}),
    });
  };

  const brand = accentColor ?? '#3b82f6';

  return (
    <Card padding="lg">
      <SectionHeading
        size="md"
        eyebrow="AI 人话解读"
        title="把报告翻译成人话"
        subtitle="觉得专业术语太抽象？让 AI 用你听得懂的方式，重新解读这份报告。"
      />

      {/* 语气切换 */}
      <div className="mt-6">
        <p className="mb-2 text-sm font-medium text-neutral-500">选择语气</p>
        <div className="flex flex-wrap gap-2">
          {TONE_OPTIONS.map((opt) => {
            const active = tone === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTone(opt.value)}
                title={opt.hint}
                className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                  active
                    ? 'border-transparent text-white'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                }`}
                style={active ? { backgroundColor: brand } : undefined}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 章节选择（可选） */}
      {sections.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-sm font-medium text-neutral-500">翻译范围</p>
          <select
            value={sectionKey}
            onChange={(e) => setSectionKey(e.target.value)}
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-brand-primary-500 focus:outline-none focus:ring-2 focus:ring-brand-primary-500/20 md:w-72"
          >
            <option value="">整份报告（可见章节）</option>
            {sections.map((s) => (
              <option key={s.sectionKey} value={s.sectionKey}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 触发按钮 */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SpringButton variant="accent" onClick={handleRun} disabled={loading || !reportId}>
          {loading ? '正在翻译…' : data ? '重新翻译' : '开始人话解读'}
        </SpringButton>
        {(data || error) && (
          <SpringButton variant="ghost" onClick={reset} disabled={loading}>
            清空
          </SpringButton>
        )}
      </div>

      {/* 加载骨架屏 */}
      {loading && (
        <div className="mt-6 space-y-3" aria-hidden>
          <div className="h-4 w-11/12 animate-pulse rounded bg-neutral-100" />
          <div className="h-4 w-full animate-pulse rounded bg-neutral-100" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-neutral-100" />
        </div>
      )}

      {/* 错误态（真实错误码，文案优先后端 message） */}
      {!loading && error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* 结果态：degraded=true 仍正常展示，仅追加轻量降级提示 */}
      {!loading && !error && data && (
        <div className="mt-6">
          {degraded && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              当前为降级解读{data.degradeReason ? `（${data.degradeReason}）` : ''}，稍后可重试获取更完整的版本。
            </div>
          )}
          <div className="rounded-xl bg-neutral-50 px-5 py-4">
            <p className="whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-neutral-700">
              {data.plainText || '暂无解读内容。'}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

export default PlainTalkPanel;