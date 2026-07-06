/**
 * P11 报告对比页（/app/report/compare）
 * -------------------------------------------------------------
 * 从历史报告中选择两份，横向对比四维度得分与族群。
 * 复用 useReportList 取列表、useReport 取各自维度；无后端时列表为空，引导先测评。
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReportList, useReport } from '../../hooks/useReport';
import { FAMILY_COLORS, FAMILY_LABEL } from '../../theme/tokens';
import {
  Card,
  StatPill,
  SectionHeading,
  Reveal,
  EmptyState,
  DimensionBars,
  SpringLink,
} from '../../components';

/** 单份报告选择器 */
function ReportPicker({
  label,
  reports,
  value,
  onChange,
  disabledId,
}: {
  label: string;
  reports: { id: string; mbtiType: string; createdAt: string }[];
  value: string;
  onChange: (id: string) => void;
  disabledId?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-sans text-xs font-semibold uppercase tracking-wider text-neutral-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-800 focus:border-brand-primary-500 focus:outline-none focus:ring-2 focus:ring-brand-primary-500/20"
      >
        <option value="">请选择报告…</option>
        {reports.map((r) => (
          <option key={r.id} value={r.id} disabled={r.id === disabledId}>
            {r.mbtiType} · {new Date(r.createdAt).toLocaleDateString('zh-CN')}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 单侧对比列：加载所选报告并展示 */
function CompareColumn({ id }: { id: string }) {
  const { data: report, isLoading } = useReport(id);
  if (!id) {
    return (
      <Card padding="lg" className="flex min-h-[280px] items-center justify-center">
        <p className="font-serif text-neutral-400">尚未选择报告</p>
      </Card>
    );
  }
  if (isLoading || !report) {
    return (
      <Card padding="lg" className="flex min-h-[280px] items-center justify-center">
        <p className="font-serif text-neutral-400">加载中…</p>
      </Card>
    );
  }
  const color = FAMILY_COLORS[report.family];
  return (
    <Card padding="lg" className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-2xl font-bold" style={{ color }}>
            {report.mbtiType}
          </h3>
          <span className="font-mono text-xs text-neutral-400">
            {FAMILY_LABEL[report.family]}
          </span>
        </div>
        <StatPill value={report.mbtiType} color={color} />
      </div>
      <p className="text-sm leading-relaxed text-neutral-600">{report.summary}</p>
      <DimensionBars data={report.dimensions} color={color} />
      <SpringLink to={`/app/report/${report.id}`} variant="ghost" className="self-start">
        查看完整报告 →
      </SpringLink>
    </Card>
  );
}

export function ReportComparePage() {
  const { data, isLoading } = useReportList();
  const reports = data?.list ?? [];

  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');

  // 默认选中最近两份
  useMemo(() => {
    if (!leftId && reports[0]) setLeftId(reports[0].id);
    if (!rightId && reports[1]) setRightId(reports[1].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports.length]);

  return (
    <section className="mx-auto max-w-5xl pb-20">
      <SectionHeading
        size="lg"
        eyebrow="COMPARE"
        title="报告对比"
        subtitle="并排查看两份人格报告——观察维度倾向的异同，理解自己的变化与稳定。"
      />

      {isLoading ? (
        <p className="mt-12 text-center font-serif text-neutral-400">加载报告列表…</p>
      ) : reports.length < 2 ? (
        <div className="mt-10">
          <EmptyState
            icon="sparkle"
            title="至少需要两份报告才能对比"
            description="完成更多测评后回来，即可横向比较不同时期的人格画像。"
            action={
              <SpringLink to="/assessment" variant="primary">
                去测评
              </SpringLink>
            }
          />
        </div>
      ) : (
        <Reveal className="mt-10 flex flex-col gap-6" deps={[reports.length]}>
          {/* 选择器 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReportPicker
              label="报告 A"
              reports={reports}
              value={leftId}
              onChange={setLeftId}
              disabledId={rightId}
            />
            <ReportPicker
              label="报告 B"
              reports={reports}
              value={rightId}
              onChange={setRightId}
              disabledId={leftId}
            />
          </div>

          {/* 对比列 */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <CompareColumn id={leftId} />
            <CompareColumn id={rightId} />
          </div>
        </Reveal>
      )}

      <p className="mt-8 text-center text-xs text-neutral-400">
        想回到列表？
        <Link to="/app/report/history" className="ml-1 text-brand-primary-600 hover:underline">
          我的报告
        </Link>
      </p>
    </section>
  );
}

export default ReportComparePage;