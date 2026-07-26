/**
 * 报告评分反馈入口（阶段4）
 * -------------------------------------------------------------
 * 交互：1~5 星 + 可选文字（≤200，带字数提示）→ POST /reports/:id/feedback。
 * 硬性红线：
 *  - reportId 取路由 :id；只提交 rating(1~5 整数) 与可选 content，严禁传 isSatisfied（后端计算）。
 *  - loading/禁用态、成功提示；已评价（回显或 4315 重复提交）禁用不可重复提交。
 *  - 错误码分流：4310/4311/4312 基础校验，4313 不存在、4314 越权、4315 重复；
 *    业务报错文案优先用后端返回 message，前端不硬编码业务文本（仅兜底通用文案）。
 */
import { useState } from 'react';
import { ApiError } from '../../api';
import { reportApi } from '../../api';
import {
  FEEDBACK_CODE,
  type ReportFeedbackResult,
} from '../../api/modules/report.api';
import { Card } from '../ui/Card';
import { SectionHeading } from '../ui/SectionHeading';
import { SpringButton } from '../system/SpringButton';

const MAX_CONTENT = 200;

export interface ReportFeedbackProps {
  /** 报告 id（来自路由 :id）。 */
  reportId: string;
  /** 主题色（族群色），用于星标高亮。 */
  accentColor?: string;
  /** 已评价回显：若报告详情已含评价结果，可传入以直接展示已评价态。 */
  submitted?: ReportFeedbackResult | null;
}

/** 5 星评分反馈组件。 */
export function ReportFeedback({ reportId, accentColor, submitted = null }: ReportFeedbackProps) {
  const brand = accentColor ?? '#3b82f6';

  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 已评价结果：优先用回显，其次为提交成功后的返回
  const [result, setResult] = useState<ReportFeedbackResult | null>(submitted);

  const done = !!result;
  const active = hover || rating;

  const handleSubmit = async () => {
    if (loading || done) return;
    // 基础页面校验：评分必填 1~5（业务校验交后端）
    if (rating < 1 || rating > 5) {
      setError('请先选择 1~5 星评分');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await reportApi.submitReportFeedback(reportId, {
        rating,
        ...(content.trim() ? { content: content.trim() } : {}),
      });
      setResult(res);
    } catch (e) {
      if (e instanceof ApiError) {
        // 重复提交：提示并置为已评价态，禁用后续提交
        if (e.code === FEEDBACK_CODE.DUPLICATE) {
          setError(e.message || '你已评价过这份报告');
          setResult({ feedbackId: '', rating, isSatisfied: rating >= 4 ? 1 : 0 });
        } else if (
          e.code === FEEDBACK_CODE.FORBIDDEN ||
          e.code === FEEDBACK_CODE.REPORT_NOT_FOUND
        ) {
          // 越权 / 报告不存在：友好提示（文案优先后端 message）
          setError(e.message || '无法为该报告提交评价');
        } else {
          // 4310/4311/4312 等基础校验及其他：优先后端文案
          setError(e.message || '提交失败，请稍后重试');
        }
      } else {
        setError('提交失败，请稍后重试');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card padding="lg">
      <SectionHeading size="md" eyebrow="FEEDBACK" title="这份报告对你有帮助吗？" />

      {done ? (
        <div className="mt-5 flex flex-col items-start gap-2">
          <div className="flex items-center gap-1" aria-label={`已评 ${result?.rating ?? rating} 星`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} filled={i <= (result?.rating ?? rating)} color={brand} />
            ))}
          </div>
          <p className="text-sm text-neutral-600">
            感谢你的反馈，我们会持续优化报告质量。
          </p>
          {error ? <p className="text-sm text-brand-primary-500">{error}</p> : null}
        </div>
      ) : (
        <div className="mt-5">
          {/* 星级选择 */}
          <div
            className="flex items-center gap-1.5"
            role="radiogroup"
            aria-label="报告评分"
            onMouseLeave={() => setHover(0)}
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={rating === i}
                aria-label={`${i} 星`}
                disabled={loading}
                onMouseEnter={() => setHover(i)}
                onClick={() => setRating(i)}
                className="rounded p-0.5 transition-transform duration-fast ease-spring hover:scale-110 disabled:cursor-not-allowed"
              >
                <Star filled={i <= active} color={brand} />
              </button>
            ))}
            <span className="ml-2 text-sm text-neutral-400">
              {rating ? `${rating} / 5` : '点击星标评分'}
            </span>
          </div>

          {/* 可选文字（≤200，带字数提示） */}
          <div className="mt-4">
            <textarea
              value={content}
              maxLength={MAX_CONTENT}
              disabled={loading}
              onChange={(e) => setContent(e.target.value.slice(0, MAX_CONTENT))}
              rows={3}
              placeholder="说说你的想法（选填）"
              className="w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition-colors focus:border-brand-primary-400 disabled:bg-neutral-50"
            />
            <div className="mt-1 text-right text-xs text-neutral-400">
              {content.length} / {MAX_CONTENT}
            </div>
          </div>

          {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}

          <div className="mt-4">
            <SpringButton
              variant="accent"
              onClick={handleSubmit}
              disabled={loading || rating < 1}
            >
              {loading ? '提交中…' : '提交评价'}
            </SpringButton>
          </div>
        </div>
      )}
    </Card>
  );
}

/** 单枚星标 SVG。 */
function Star({ filled, color }: { filled: boolean; color: string }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={filled ? color : '#cbd5e1'}
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 18.6l-5.9 3.1 1.2-6.6L2.5 9.5l6.6-.9z" />
    </svg>
  );
}

export default ReportFeedback;