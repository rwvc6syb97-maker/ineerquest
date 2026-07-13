/**
 * L-P0-3 AI 追问式测评校准面板
 * -------------------------------------------------------------
 * 内嵌于报告页：对临界维度（偏好接近 50% 模糊）追问二选一，后端重算并落库，
 * 提交后回显是否发生类型变化。
 *
 * 硬性红线（对齐 useAiPlus / ai-plus.api）：
 *  - 全走真实 useCalibration hook，禁止 mock 兜底掩盖契约。
 *  - 临界判定/重算全在后端，前端只渲染题目 + 回传 answers，不做业务判定。
 *  - 错误码分流：4514 无需校准 → 友好提示（非报错弹窗）；4090 已完成校准 → 提示回显；
 *    4203 结果不存在/无权 → 展示后端 message。
 *  - 文案优先后端 message，前端不硬编码业务报错文本。
 */
import { useEffect, useMemo, useState } from 'react';
import { useCalibration } from '../../hooks/useAiPlus';
import type { CalibrationChoice } from '../../api/modules/ai-plus.api';
import { Card } from '../ui/Card';
import { SectionHeading } from '../ui/SectionHeading';
import { SpringButton } from '../system/SpringButton';

export interface CalibrationPanelProps {
  /** 测评结果 id（string）。报告页可用 report.recordId。 */
  resultId: string;
  /** 主题色（族群色），用于按钮/高亮。 */
  accentColor?: string;
}

/** 追问式测评校准面板。 */
export function CalibrationPanel({ resultId, accentColor }: CalibrationPanelProps) {
  const {
    check,
    submitResult,
    loading,
    submitting,
    error,
    noNeed,
    alreadyCalibrated,
    loadCheck,
    submit,
  } = useCalibration();
  const [started, setStarted] = useState(false);
  const [choices, setChoices] = useState<Record<string, CalibrationChoice>>({});

  const brand = accentColor ?? '#3b82f6';

  // 用户主动开始后拉取判定（避免进报告页即发起额外请求）
  useEffect(() => {
    if (started && resultId) void loadCheck(resultId);
  }, [started, resultId, loadCheck]);

  const questions = check?.questions ?? [];
  const allAnswered = useMemo(
    () => questions.length > 0 && questions.every((q) => choices[q.dimension]),
    [questions, choices],
  );

  const handleSubmit = () => {
    if (!allAnswered) return;
    const answers = questions.map((q) => ({ dimension: q.dimension, choice: choices[q.dimension] }));
    void submit(resultId, { answers });
  };

  return (
    <Card padding="lg">
      <SectionHeading
        size="md"
        eyebrow="AI 追问校准"
        title="校准你的模糊维度"
        subtitle="有些维度你的倾向很接近中间值。用几道追问帮你把结果调得更准。"
      />

      {/* 未开始：引导按钮 */}
      {!started && (
        <div className="mt-6">
          <SpringButton
            variant="accent"
            onClick={() => setStarted(true)}
            disabled={!resultId}
          >
            开始追问校准
          </SpringButton>
        </div>
      )}

      {/* 加载中骨架 */}
      {started && loading && (
        <div className="mt-6 space-y-3" aria-hidden>
          <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-100" />
          <div className="h-10 w-full animate-pulse rounded bg-neutral-100" />
          <div className="h-10 w-full animate-pulse rounded bg-neutral-100" />
        </div>
      )}

      {/* 4514 无需校准：友好提示 */}
      {started && !loading && noNeed && (
        <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
          你的各维度倾向都比较清晰，暂时无需校准。
        </div>
      )}

      {/* 4090 已完成校准：提示（结果态优先下方回显） */}
      {started && !loading && alreadyCalibrated && !submitResult && (
        <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
          你已经完成过这次校准。
        </div>
      )}

   {/* 其他错误：展示后端 message */}
      {started && !loading && error && !noNeed && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* 追问题目 */}
      {started && !loading && !submitResult && questions.length > 0 && (
        <div className="mt-6 space-y-6">
          {questions.map((q) => (
            <div key={q.dimension} className="rounded-xl border border-neutral-200 p-4">
              <div className="mb-1 flex items-center gap-2 text-xs text-neutral-400">
                <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono">{q.dimension}</span>
                <span>当前倾向 {q.currentPercent}%</span>
              </div>
              <p className="mb-3 text-sm font-medium text-neutral-800">{q.question}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {q.options.map((opt) => {
                  const active = choices[q.dimension] === opt.choice;
                  return (
                    <button
                      key={opt.choice}
                      type="button"
                      onClick={() =>
                        setChoices((prev) => ({ ...prev, [q.dimension]: opt.choice }))
                      }
                      className={`rounded-xl border px-4 py-2.5 text-left text-sm transition-colors ${
                       active
                          ? 'border-transparent text-white'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                      }`}
                      style={active ? { backgroundColor: brand } : undefined}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <SpringButton
            variant="accent"
            onClick={handleSubmit}
            disabled={!allAnswered || submitting}
          >
            {submitting ? '提交中…' : '提交校准'}
          </SpringButton>
        </div>
      )}

      {/* 提交结果回显 */}
      {submitResult && (
        <div className="mt-6 rounded-xl bg-neutral-50 px-5 py-4">
         {submitResult.changed ? (
            <p className="text-sm text-neutral-700">
              校准完成，你的类型由{' '}
              <span className="font-mono font-semibold">{submitResult.originalType}</span> 调整为{' '}
              <span className="font-mono font-semibold" style={{ color: brand }}>
                {submitResult.calibratedType}
              </span>
              。
            </p>
          ) : (
            <p className="text-sm text-neutral-700">
              校准完成，你的类型仍为{' '}
              <span className="font-mono font-semibold">{submitResult.calibratedType}</span>
              ，结果更可靠了。
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

export default CalibrationPanel;