/**
 * P07 断点续答页（/assessment/resume）
 * -------------------------------------------------------------
 * - 读取本地草稿（Zustand + localStorage）进度：已答题数 / 当前页
 * - 提供两个选择：继续上次作答（续答）或 放弃重测（重新开始）
 * - 无草稿时用 EmptyState 引导前往测评说明页 P04
 *
 * 设计落点：
 * - 复用 Card / SectionHeading / EmptyState / StatPill / DimensionBar 意象与令牌
 * - 续答 = 品牌蓝主 CTA；重测 = 次级 ghost（低强调，避免误触）
 * - 进度以 mono 数值 + 蓝色进度条呈现，无花哨动效
 * - TODO(blocked)：云端进度以本地草稿兜底；接后端后可拉取 GET records 校准
 */
import { useNavigate } from 'react-router-dom';
import { useQuestions } from '../../hooks/useAssessment';
import { useAssessmentStore } from '../../stores/assessment.store';
import { SpringButton, SpringLink } from '../../components/system/SpringButton';
import { Card, EmptyState, SectionHeading } from '../../components';

const PAGE_SIZE = 10;

export function ResumePage() {
  const navigate = useNavigate();
  const { data: bank } = useQuestions('v2');
  const { hasDraft, answeredCount, page, reset } = useAssessmentStore();

  const total = bank?.total || bank?.questions?.length || 40;
  const answered = answeredCount();
  const draft = hasDraft();
  const percent = total ? Math.round((answered / total) * 100) : 0;
  const currentPage = page + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  // 无草稿：空状态引导回测评说明
  if (!draft) {
    return (
      <div className="py-16">
        <EmptyState
          icon="compass"
          title="暂无未完成的测评"
          description="你还没有进行中的测评草稿。开始一次全新的测评，探索属于你的人格坐标。"
          action={
            <SpringLink to="/assessment" variant="accent" className="w-48">
              开始新测评
            </SpringLink>
          }
        />
      </div>
    );
  }

  const resume = () => navigate('/assessment/quiz');
  const restart = () => {
    reset();
    navigate('/assessment');
  };

  return (
    <div className="py-16">
      <SectionHeading
        as="h1"
        size="lg"
        align="left"
        eyebrow="断点续答"
        title="欢迎回来，继续你的求索"
        subtitle="我们保存了你上次的作答进度，你可以从断点继续，也可以重新开始。"
      />

      {/* 进度卡 */}
      <Card padding="lg" className="mt-10">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-neutral-600">当前进度</span>
          <span className="font-mono text-2xl font-bold text-brand-primary-600">
            {percent}
            <span className="text-base text-neutral-400">%</span>
          </span>
        </div>

        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full rounded-full bg-brand-primary-500 transition-[width] duration-normal ease-spring"
            style={{ width: `${percent}%` }}
          />
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-neutral-400">已作答</dt>
            <dd className="mt-1 font-mono text-lg font-semibold text-brand-primary-900">
              {answered} <span className="text-sm text-neutral-400">/ {total}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-400">当前页</dt>
            <dd className="mt-1 font-mono text-lg font-semibold text-brand-primary-900">
              {currentPage} <span className="text-sm text-neutral-400">/ {totalPages}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-400">剩余题目</dt>
            <dd className="mt-1 font-mono text-lg font-semibold text-brand-accent-600">
              {Math.max(total - answered, 0)}
            </dd>
          </div>
        </dl>
      </Card>

      {/* 两个选择：续答（主）/ 重测（次级） */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SpringButton variant="primary" onClick={resume} className="w-full sm:w-56">
          继续上次作答
        </SpringButton>
        <SpringButton variant="ghost" onClick={restart} className="w-full sm:w-40">
          放弃并重测
        </SpringButton>
      </div>
      <p className="mt-3 text-xs text-neutral-400">
        选择「放弃并重测」将清空当前草稿，此操作不可撤销。
      </p>
    </div>
  );
}