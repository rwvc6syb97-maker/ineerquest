/**
 * P10 报告历史页
 * - 列出我的历史报告（复用 useReportList，失败静默为空）
 * - 点击进入报告 P08
 */
import { useNavigate } from 'react-router-dom';
import { useReportList } from '../../hooks/useReport';
import { FAMILY_COLORS, FAMILY_LABEL, familyOf } from '../../theme/tokens';
import { SpringButton } from '../../components/system/SpringButton';

export function HistoryPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useReportList();
  const reports = data?.list ?? [];

  return (
    <section className="mx-auto max-w-2xl pb-16">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">我的报告</h1>
        <div className="flex items-center gap-4">
          {reports.length >= 2 ? (
            <button
              onClick={() => navigate('/app/report/compare')}
              className="text-sm font-medium text-brand-primary-500 hover:text-brand-primary-600"
            >
              对比报告
            </button>
          ) : null}
          <button onClick={() => navigate('/app')} className="text-sm text-slate-400 hover:text-slate-600">
            返回中心
          </button>
        </div>
      </header>

      {isLoading ? (
        <p className="mt-10 text-center text-slate-400">加载中…</p>
      ) : reports.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-slate-500">还没有报告，去做一次测评吧</p>
          <SpringButton className="mt-4" onClick={() => navigate('/assessment')}>
            开始测评
          </SpringButton>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4">
          {reports.map((r) => {
            const family = familyOf(r.mbtiType);
            return (
            <button
              key={r.id}
              onClick={() => navigate(`/app/report/${r.id}`)}
         className="flex items-center gap-4 rounded-2xl border border-slate-200 p-5 text-left transition-shadow hover:shadow-md"
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white"
                style={{ backgroundColor: FAMILY_COLORS[family] }}
              >
                {r.mbtiType}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-800">{FAMILY_LABEL[family]}</div>
                <div className="text-xs text-slate-400">
                  {new Date(r.createdAt).toLocaleDateString()}
                </div>
              </div>
              <span className="text-slate-300">›</span>
            </button>
            );
          })}
        </div>
      )}
    </section>
  );
}