/**
 * 运营后台 - 数据看板（T4-17 / P35）
 * -------------------------------------------------------------
 * 概览指标卡 + 用户增长折线 + 营收趋势折线 + 测评转化漏斗 + 付费率环形 + 完成率仪表盘。
 * - 数据源降级：每个接口返回 source（clickhouse|mysql|mock），页面顶部统一标注。
 * - 时间范围切换：7 / 30 / 90 天，联动增长/营收/漏斗/完成率查询。
 * - 全部走 React Query；加载/错误/空数据均有兜底，禁止白屏。
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminAnalyticsApi, ApiError } from '../../api';
import type { FunnelStep } from '../../api/modules/admin-analytics.api';
import { Card } from '../../components/ui/Card';
import {
  LineChart,
  FunnelChart,
  PieChart,
  GaugeChart,
} from '../../components/charts/AdminCharts';

const DAYS_OPTIONS = [7, 30, 90] as const;

const FUNNEL_LABELS: Record<FunnelStep, string> = {
  assessment_start: '开始测评',
  submit: '提交答卷',
  report_generate: '生成报告',
  report_unlock: '解锁报告',
};

const SOURCE_LABELS: Record<string, string> = {
  clickhouse: 'ClickHouse',
  mysql: 'MySQL 降级',
  mock: 'Mock 兜底',
};

/** 分转元 */
function yuan(cents: number): string {
  return `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function SourceTag({ source }: { source?: string }) {
  if (!source) return null;
  const isDegraded = source !== 'clickhouse';
  return (
    <span
      className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${
      isDegraded ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
      }`}
    >
      {SOURCE_LABELS[source] ?? source}
    </span>
  );
}

function ErrorHint({ error }: { error: unknown }) {
  const msg = error instanceof ApiError ? error.message : '数据加载失败';
  return <p className="py-8 text-center text-sm text-red-500">{msg}</p>;
}

export function AnalyticsPage() {
  const [days, setDays] = useState<number>(30);

  const overview = useQuery({
    queryKey: ['admin', 'analytics', 'overview'],
    queryFn: () => adminAnalyticsApi.getOverview(),
  });
  const growth = useQuery({
    queryKey: ['admin', 'analytics', 'growth', days],
    queryFn: () => adminAnalyticsApi.getGrowth(days),
  });
  const revenue = useQuery({
    queryKey: ['admin', 'analytics', 'revenue', days],
    queryFn: () => adminAnalyticsApi.getRevenue(days),
  });
  const funnel = useQuery({
    queryKey: ['admin', 'analytics', 'funnel', days],
    queryFn: () => adminAnalyticsApi.getFunnel(days),
  });
  const rate = useQuery({
    queryKey: ['admin', 'analytics', 'rate', days],
    queryFn: () => adminAnalyticsApi.getAssessmentRate(days),
  });

  const ov = overview.data;

  return (
    <div className="flex flex-col gap-6">
      {/* 标题 + 时间范围 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">数据看板</h1>
        <div className="flex gap-1 rounded-lg bg-slate-200 p-1">
          {DAYS_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1 text-sm ${
              days === d ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              近 {d} 天
            </button>
          ))}
        </div>
      </div>

      {/* 概览指标卡 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {overview.isLoading ? (
          <p className="col-span-full py-6 text-center text-sm text-slate-400">加载中…</p>
        ) : overview.isError ? (
          <div className="col-span-full">
            <ErrorHint error={overview.error} />
          </div>
        ) : ov ? (
          [
            { label: '累计用户', value: ov.totalUsers.toLocaleString() },
            { label: '付费用户', value: ov.paidUsers.toLocaleString() },
            { label: '付费订单', value: ov.paidOrders.toLocaleString() },
            { label: '累计 GMV', value: yuan(ov.gmvCents) },
          ].map((m) => (
            <Card key={m.label} padding="md">
              <p className="text-xs text-slate-500">
                {m.label}
                {m.label === '累计用户' && <SourceTag source={ov.source} />}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{m.value}</p>
            </Card>
          ))
        ) : null}
      </div>

      {/* 折线：增长 + 营收 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="md">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            用户增长
            <SourceTag source={growth.data?.source} />
          </h2>
          {growth.isLoading ? (
            <p className="py-8 text-center text-sm text-slate-400">加载中…</p>
          ) : growth.isError ? (
            <ErrorHint error={growth.error} />
          ) : (
            <LineChart
              labels={(growth.data?.series ?? []).map((p) => p.date)}
              values={(growth.data?.series ?? []).map((p) => p.count)}
            />
          )}
        </Card>

        <Card padding="md">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            营收趋势
            <SourceTag source={revenue.data?.source} />
          </h2>
          {revenue.isLoading ? (
            <p className="py-8 text-center text-sm text-slate-400">加载中…</p>
          ) : revenue.isError ? (
            <ErrorHint error={revenue.error} />
          ) : (
            <LineChart
              labels={(revenue.data?.series ?? []).map((p) => p.date)}
              values={(revenue.data?.series ?? []).map((p) => p.amountCents)}
              formatValue={yuan}
            />
          )}
        </Card>
      </div>

      {/* 漏斗 + 付费率 + 完成率 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card padding="md" className="lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            测评转化漏斗
            <SourceTag source={funnel.data?.source} />
          </h2>
          {funnel.isLoading ? (
            <p className="py-8 text-center text-sm text-slate-400">加载中…</p>
          ) : funnel.isError ? (
            <ErrorHint error={funnel.error} />
          ) : (
            <FunnelChart
              steps={(funnel.data?.funnel ?? []).map((n) => ({
                label: FUNNEL_LABELS[n.step] ?? n.step,
                count: n.count,
              }))}
            />
          )}
        </Card>

        <Card padding="md" className="flex flex-col items-center justify-center">
          <h2 className="mb-3 self-start text-sm font-semibold text-slate-700">付费转化率</h2>
          {ov ? <PieChart ratio={ov.payRate} label="付费用户占比" /> : (
            <p className="py-8 text-sm text-slate-400">暂无数据</p>
          )}
        </Card>

        <Card padding="md" className="flex flex-col items-center justify-center">
          <h2 className="mb-3 self-start text-sm font-semibold text-slate-700">
            测评完成率
            <SourceTag source={rate.data?.source} />
          </h2>
          {rate.isLoading ? (
            <p className="py-8 text-center text-sm text-slate-400">加载中…</p>
          ) : rate.isError ? (
            <ErrorHint error={rate.error} />
          ) : rate.data ? (
            <>
              <GaugeChart value={rate.data.completeRate} label="提交/开始" />
              <p className="mt-2 text-xs text-slate-500">
                开始 {rate.data.started.toLocaleString()} · 提交 {rate.data.submitted.toLocaleString()}
              </p>
            </>
          ) : null}
        </Card>
      </div>
    </div>
  );
}