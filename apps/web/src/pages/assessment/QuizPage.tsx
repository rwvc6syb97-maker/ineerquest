/**
 * P05 答题页（/assessment/quiz）
 * -------------------------------------------------------------
 * - 每页 10 题分页，顶部 sticky 进度条（进度亮点用强调橙）
 * - 逐题作答写入草稿 store（localStorage 持久化，断点自动保存）
 * - 翻页时异步保存草稿到后端（失败静默，本地已兜底）
 * - 完成全部题目后跳转 P06 生成中页触发提交
 *
 * 设计落点（信息密集区，遵守低动效）：
 * - 仅选项选中态有 ease-spring 微反馈：对应 MBTI 维度色 8% 填充 + 维度色边框 + 左侧对勾
 * - 切题用简单 duration-fast 淡入（key 触发），不做花哨转场
 * - 无限循环 / 大动画一律禁止，全部随 prefers-reduced-motion 降级
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuestions, useSaveAnswers } from '../../hooks/useAssessment';
import { useAssessmentStore } from '../../stores/assessment.store';
import type { Dimension } from '../../api/modules/assessment.api';
import { SpringButton } from '../../components/system/SpringButton';

const PAGE_SIZE = 10;

/**
 * 维度选中态代表色（MBTI 八维色中每维取一个代表色作选中主色）：
 * EI→I 蓝 / SN→N 紫 / TF→F 粉 / JP→J 青。信息密集区保持克制统一。
 */
const DIMENSION_COLOR: Record<Dimension, string> = {
  EI: '#3b82f6', // I 蓝
  SN: '#8b5cf6', // N 紫
  TF: '#ec4899', // F 粉
  JP: '#0ea5e9', // J 青
};

export function QuizPage() {
  const navigate = useNavigate();
  const { data: bank, isLoading, isError, refetch } = useQuestions('v2');
  const questions = bank?.questions ?? [];
  const { recordId, answers, page, answer, setPage, answeredCount, toAnswers } =
    useAssessmentStore();
  const saveAnswers = useSaveAnswers();

  const totalPages = Math.ceil(questions.length / PAGE_SIZE) || 1;
  const current = useMemo(
    () => questions.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [questions, page],
  );
  const progress = questions.length
    ? Math.round((answeredCount() / questions.length) * 100)
    : 0;
  const pageAllAnswered = current.every((q) => answers[q.id] != null);
  const isLastPage = page >= totalPages - 1;

  const syncDraft = () => {
    // 翻页时保存草稿到后端；失败静默（本地 store 已持久化，下次可续答重试）
    if (recordId) {
      saveAnswers.mutate({ recordId, answers: toAnswers() });
    }
  };

  const next = async () => {
    if (isLastPage) {
      if (!recordId) {
        // 无有效 recordId（未成功创建记录）——回说明页重新开始
        navigate('/assessment', { replace: true });
        return;
      }
      // 关键：末页必须等最后一页答案 PATCH 到后端成功后再进入提交页，
      // 否则 submit 时后端读到的 answers 不完整会返回 ASSESSMENT_INCOMPLETE（竞态）。
      try {
        await saveAnswers.mutateAsync({ recordId, answers: toAnswers() });
      } catch {
        // 保存失败则不跳转，避免带着不完整答案进入提交页导致误报“未完成”
        return;
      }
      navigate('/assessment/generating');
    } else {
      syncDraft();
      setPage(page + 1);
      window.scrollTo({ top: 0 });
    }
  };

  const prev = () => {
    if (page > 0) {
      setPage(page - 1);
      window.scrollTo({ top: 0 });
    }
  };

  if (isLoading) {
    return <p className="py-16 text-center text-sm text-neutral-400">题目加载中…</p>;
  }

  if (isError) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-neutral-500">题目加载失败，可能是网络或服务异常。</p>
        <div className="mt-4 flex justify-center">
          <SpringButton variant="primary" onClick={() => void refetch()} className="w-40">
            重新加载
          </SpringButton>
        </div>
      </div>
    );
  }

  return (
    <section className="py-6">
      {/* sticky 进度条：数字用 mono，进度亮点橙 */}
      <div className="sticky top-0 z-10 -mx-6 border-b border-neutral-100 bg-white/95 px-6 pb-3 pt-2 backdrop-blur">
        <div className="mb-2 flex items-baseline justify-between text-xs text-neutral-500">
          <span>
            第 <span className="font-mono font-semibold text-brand-primary-700">{page + 1}</span> / {totalPages} 页
          </span>
          <span>
            已答 <span className="font-mono font-semibold text-brand-accent-600">{answeredCount()}</span> / {questions.length}
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-neutral-100"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-brand-accent-500 transition-[width] duration-normal ease-spring"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 题目列表：key=page 触发切题淡入（duration-fast，低动效） */}
      <div key={page} className="mt-6 flex animate-fadeUp flex-col gap-5 [animation-duration:250ms]">
        {current.map((q, idx) => {
          const dimColor = DIMENSION_COLOR[q.dimension];
          return (
            <div
              key={q.id}
              className="rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-sm"
            >
              <p className="text-sm font-medium leading-relaxed text-brand-primary-950">
                <span className="mr-1.5 font-mono text-neutral-400">
                  {page * PAGE_SIZE + idx + 1}.
                </span>
                {q.content}
              </p>
              {/* 李克特 5 点刻度条：两端语义锚点 + 一行等距圆点（两端大、中间小），选中态维度色填充 */}
              <div className="mt-5">
                <div className="flex items-center justify-between gap-2">
                  {q.options.map((opt, oi) => {
                    const selected = answers[q.id] === opt.id;
                    // 直径按到中点(index 2)的距离递变：两端最大、中立最小
                    const step = Math.abs(oi - 2); // 2,1,0,1,2
                    const size = 20 + step * 8; // 20~36px
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={selected}
                        aria-label={opt.content}
                        title={opt.content}
                        onClick={() => answer(q.id, opt.id)}
                        className="flex flex-1 items-center justify-center rounded-full py-1 transition-transform duration-fast ease-spring focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                        style={{ transform: selected ? 'scale(1.12)' : 'scale(1)' }}
                      >
                        <span
                          className="inline-flex items-center justify-center rounded-full border-2 transition-all duration-fast ease-spring"
                          style={{
                            width: `${size}px`,
                            height: `${size}px`,
                            borderColor: selected ? dimColor : '#cbd5e1',
                            backgroundColor: selected ? dimColor : '#fff',
                            boxShadow: selected ? `0 0 0 4px ${dimColor}22` : 'none',
                          }}
                        >
                          {selected && (
                            <svg
                              viewBox="0 0 20 20"
                              className="h-1/2 w-1/2"
                              fill="none"
                              stroke="#fff"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M4 10.5 L8.5 15 L16 5.5" />
                            </svg>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-neutral-400">
                  <span>不同意</span>
                  <span>同意</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 翻页 */}
      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={prev}
          disabled={page === 0}
          className="rounded-xl border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:opacity-40"
        >
          上一页
        </button>
        <SpringButton
          onClick={() => void next()}
          disabled={!pageAllAnswered || (isLastPage && saveAnswers.isPending)}
          variant={isLastPage ? 'accent' : 'primary'}
        >
          {isLastPage ? (saveAnswers.isPending ? '保存中…' : '提交测评') : '下一页'}
        </SpringButton>
      </div>
      {!pageAllAnswered && (
        <p className="mt-3 text-center text-xs text-neutral-400">请完成本页全部题目后继续</p>
      )}
    </section>
  );
}