/**
 * P25 我的成长计划页（/app/me/plan）
 * -------------------------------------------------------------
 * 复用 GET /growth/plan（careerPlanApi.getGrowthPlans）与 useGrowthPlans hook。
 * 展示成长计划任务列表 + 完成打卡（careerPlanApi.toggleGrowthTask，失败则本地乐观更新）+ 进度。
 * 数据请求失败呈现错误态并支持重试（见 useCareerPlan）；加载/空态用 EmptyState 兜底。
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  StatPill,
  Tag,
  SectionHeading,
  Reveal,
  RevealItem,
  EmptyState,
  SpringButton,
} from '../../components';
import { COLORS } from '../../theme/tokens';
import { useGrowthPlans } from '../../hooks/useCareerPlan';
import { careerPlanApi } from '../../api';
import type { GrowthPlan } from '../../api/modules/career-plan.api';

const STATUS_LABEL: Record<GrowthPlan['status'], string> = {
  1: '进行中',
  2: '已完成',
  3: '已放弃',
};

export function MyPlanPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useGrowthPlans();
  const [plans, setPlans] = useState<GrowthPlan[]>([]);

  useEffect(() => {
    if (data) setPlans(data);
  }, [data]);

  // 概览统计
  const stats = useMemo(() => {
    const allTasks = plans.flatMap((p) => p.tasks);
    const doneTasks = allTasks.filter((t) => t.isDone).length;
    const avgProgress = plans.length
      ? Math.round(plans.reduce((sum, p) => sum + p.progress, 0) / plans.length)
      : 0;
    return { total: plans.length, doneTasks, totalTasks: allTasks.length, avgProgress };
  }, [plans]);

  // 任务打卡（乐观更新 + 接口/mock 兜底）
  const toggleTask = async (planId: string, taskId: string) => {
    const target = plans.find((p) => p.id === planId)?.tasks.find((t) => t.id === taskId);
    const nextDone = !(target?.isDone ?? false);
    setPlans((prev) =>
      prev.map((p) => {
        if (p.id !== planId) return p;
        const tasks = p.tasks.map((t) =>
          t.id === taskId
            ? { ...t, isDone: nextDone, doneAt: nextDone ? new Date().toISOString() : undefined }
            : t,
        );
        const done = tasks.filter((t) => t.isDone).length;
        const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
        return { ...p, tasks, progress, status: progress === 100 ? 2 : (p.status === 2 ? 1 : p.status) };
      }),
    );
    try {
      await careerPlanApi.toggleGrowthTask(planId, taskId, nextDone);
    } catch {
      /* 无后端：仅本地乐观更新 */
    }
  };

  return (
    <section className="mx-auto max-w-5xl pb-16">
      <SectionHeading
        size="lg"
        eyebrow="MY PLAN"
        title="我的成长计划"
        subtitle="把目标拆成一个个可执行的任务，逐项打卡，让改变发生。"
      />

      {isLoading ? (
        <p className="mt-10 text-center font-serif text-neutral-400">计划加载中…</p>
      ) : isError ? (
        <div className="mt-8">
          <EmptyState
            icon="compass"
            title="计划加载失败"
            description="可能是网络或服务异常，请稍后重试。"
            action={<SpringButton onClick={() => refetch()}>重新加载</SpringButton>}
          />
        </div>
      ) : plans.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon="compass"
            title="还没有成长计划"
            description="完成一次职业匹配后，可基于目标岗位生成你的专属成长路线。"
            action={
              <SpringButton variant="accent" onClick={() => navigate('/app/career')}>
                去发现职业
              </SpringButton>
            }
          />
        </div>
      ) : (
        <>
          {/* 概览统计 */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatPill label="计划总数" value={stats.total} tone="brand" />
            <StatPill label="平均进度" value={stats.avgProgress} suffix="%" tone="accent" />
            <StatPill label="已打卡" value={stats.doneTasks} tone="neutral" />
            <StatPill label="任务总数" value={stats.totalTasks} tone="neutral" />
          </div>

          {/* 计划卡 + 任务打卡 */}
          <Reveal className="mt-8 flex flex-col gap-6" deps={[plans.length]}>
            {plans.map((p) => (
              <RevealItem key={p.id}>
                <Card padding="lg">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display text-lg font-semibold text-brand-primary-950">
                        {p.title}
                      </h3>
                      {p.careerTitle && (
                        <p className="mt-0.5 text-xs text-neutral-400">目标 · {p.careerTitle}</p>
                      )}
                    </div>
                    <Tag tone={p.status === 2 ? 'success' : p.status === 1 ? 'brand' : 'neutral'}>
                      {STATUS_LABEL[p.status]}
                    </Tag>
                  </div>

                  {/* 进度条 */}
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs text-neutral-400">
                      <span>完成进度</span>
                      <span className="tabular-nums" style={{ color: COLORS.accent }}>{p.progress}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${p.progress}%`,
                          backgroundColor: COLORS.brand,
                          transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
                        }}
                      />
                    </div>
                  </div>

                  {/* 任务打卡 */}
                  <ul className="mt-5 flex flex-col gap-1">
                    {p.tasks.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => toggleTask(p.id, t.id)}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-neutral-50"
                        >
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                              t.isDone ? 'border-transparent text-white' : 'border-neutral-300 text-transparent'
                            }`}
                            style={t.isDone ? { backgroundColor: COLORS.brand } : undefined}
                          >
                            ✓
                          </span>
                          <span className={`flex-1 text-sm ${t.isDone ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}>
                            {t.content}
                          </span>
                          {t.isDone && t.doneAt && (
                            <span className="shrink-0 text-xs text-neutral-300">
                              {new Date(t.doneAt).toLocaleDateString()}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>
              </RevealItem>
            ))}
          </Reveal>
        </>
      )}
    </section>
  );
}

export default MyPlanPage;