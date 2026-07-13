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
import { useGrowthPlan } from '../../hooks/useAiPlus';
import { useFavoriteList } from '../../hooks/useFavorites';
import { careerPlanApi } from '../../api';
import type { GrowthPlan } from '../../api/modules/career-plan.api';

const STATUS_LABEL: Record<GrowthPlan['status'], string> = {
  1: '进行中',
  2: '已完成',
  3: '已放弃',
};

/**
 * AI 成长计划区块（P1-1，会员专享）
 * -------------------------------------------------------------
 * 复用 useGrowthPlan()（POST /ai/career/growth-plan）。目标职业下拉源自收藏列表。
 * - 4515 非会员 → memberOnly 引导开通会员（非报错弹窗）
 * - degraded=true（规则版）仍正常展示 weeks + amber 轻提示
 * - 其它错误码展示后端 message + errorCode，不回退 mock
 */
function AiGrowthPlanSection() {
  const navigate = useNavigate();
  const { data: favData, isLoading: favLoading } = useFavoriteList({ pageSize: 50 });
  const favorites = favData?.list ?? [];
  const { data, loading, error, errorCode, memberOnly, degraded, run } = useGrowthPlan();

  const [careerId, setCareerId] = useState('');
  const [targetMonths, setTargetMonths] = useState(3);

  const generate = () => {
    if (!careerId) return;
    void run({ careerId, targetMonths });
  };

  return (
    <Card padding="lg" className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-semibold text-brand-primary-950">AI 成长计划</h3>
          <p className="mt-0.5 text-xs text-neutral-400">
            选择目标职业，AI 为你生成分周成长路线（会员专享）
          </p>
        </div>
        <Tag tone="accent" size="sm">AI 生成</Tag>
      </div>

      {/* 目标职业 + 目标月数 + 生成 */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1 block text-xs text-neutral-500">目标职业（来自你的收藏）</span>
          <select
            value={careerId}
            onChange={(e) => setCareerId(e.target.value)}
            disabled={favLoading || favorites.length === 0}
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-800 focus:border-brand-primary-500 focus:outline-none focus:ring-2 focus:ring-brand-primary-500/20 disabled:bg-neutral-50 disabled:text-neutral-300"
          >
            <option value="">请选择目标职业…</option>
            {favorites.map((f) => (
           <option key={f.favoriteId} value={String(f.careerId)}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="sm:w-32">
          <span className="mb-1 block text-xs text-neutral-500">目标月数</span>
          <select
         value={targetMonths}
            onChange={(e) => setTargetMonths(Number(e.target.value))}
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-800 focus:border-brand-primary-500 focus:outline-none focus:ring-2 focus:ring-brand-primary-500/20"
          >
            {[1, 3, 6, 12].map((m) => (
              <option key={m} value={m}>{m} 个月</option>
            ))}
          </select>
        </label>
        <SpringButton variant="accent" disabled={loading || !careerId} onClick={generate}>
          {loading ? '生成中…' : '生成计划'}
        </SpringButton>
      </div>

      {favorites.length === 0 && !favLoading ? (
        <p className="mt-3 text-xs text-neutral-400">
          还没有收藏的目标职业，先去职业库收藏一个吧。
        </p>
      ) : null}

      {/* 非会员引导（4515，引导型非报错弹窗） */}
      {memberOnly ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">{error ?? 'AI 成长计划为会员专享，开通会员即可解锁。'}</p>
          <SpringButton variant="accent" className="mt-2" onClick={() => navigate('/app/membership')}>
            开通会员
          </SpringButton>
        </div>
      ) : error ? (
        // 常规错误：展示后端 message + errorCode，不回退 mock
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
          {errorCode ? <span className="ml-1 font-mono text-xs opacity-70">({errorCode})</span> : null}
        </p>
      ) : null}

      {/* degraded 轻提示 */}
      {data && degraded ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          当前为规则版计划（AI 服务繁忙），内容仍可参考。
        </p>
      ) : null}

      {/* 分周计划展示 */}
      {data && data.weeks.length > 0 ? (
        <div className="mt-5 flex flex-col gap-4">
          {data.weeks.map((w) => (
            <div key={w.weekNo} className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-4">
              <p className="text-sm font-semibold text-brand-primary-900">
                第 {w.weekNo} 周 · {w.theme}
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {w.tasks.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-neutral-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS.accent }} />
                  <span className="flex-1">
                      {t.title}
                      {t.resourceUrl ? (
                        <a
                          href={t.resourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 text-xs text-brand-primary-600 hover:underline"
                        >
                          参考资源
                        </a>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

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

      {/* P1-1 AI 成长计划（会员专享，内嵌区块） */}
      <AiGrowthPlanSection />

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