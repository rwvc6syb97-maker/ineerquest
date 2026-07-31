/**
 * P10 报告历史页
 * - 列出我的历史报告（复用 useReportList）
 * - 点击进入报告 P08
 * - M2：批量导出（多选 → POST /reports/export/batch → GET .../:taskId 拉取 zip）
 *   错误文案优先用后端 message，前端仅做兜底提示；不做 mock。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReportList } from '../../hooks/useReport';
import { reportApi } from '../../api';
import { REPORT_EXPORT_CODE } from '../../api/modules/report.api';
import { ApiError } from '../../api/client';
import { FAMILY_COLORS, FAMILY_LABEL, familyOf } from '../../theme/tokens';
import { SpringButton } from '../../components/system/SpringButton';

/** 批量导出错误码 → 中文兜底文案（优先用后端 message） */
const EXPORT_FALLBACK: Record<number, string> = {
  [REPORT_EXPORT_CODE.EMPTY_IDS]: '请至少选择一份报告',
  [REPORT_EXPORT_CODE.TOO_MANY]: '单次最多导出 50 份，请减少选择',
  [REPORT_EXPORT_CODE.FORBIDDEN]: '包含无权访问的报告，已取消导出',
  [REPORT_EXPORT_CODE.TASK_NOT_FOUND]: '导出任务已过期，请重新导出',
};

function resolveExportError(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message || EXPORT_FALLBACK[err.code] || '导出失败，请稍后再试';
  }
  return '网络异常，请检查连接后重试';
}

export function HistoryPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useReportList();
  const reports = data?.list ?? [];

  // 批量导出多选态
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
    setExportError(null);
  };

  const handleBatchExport = async () => {
    const ids = Array.from(selected);
    if (!ids.length) {
      setExportError(EXPORT_FALLBACK[REPORT_EXPORT_CODE.EMPTY_IDS]);
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      const task = await reportApi.exportReportBatch(ids);
      const blob = await reportApi.downloadBatchExport(task.taskId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reports-${task.taskId}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      exitSelect();
    } catch (err) {
      setExportError(resolveExportError(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="mx-auto max-w-2xl pb-16">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">我的报告</h1>
        <div className="flex items-center gap-4">
          {reports.length >= 2 && !selectMode ? (
            <button
              onClick={() => navigate('/app/report/compare')}
              className="text-sm font-medium text-brand-primary-500 hover:text-brand-primary-600"
            >
              对比报告
            </button>
          ) : null}
          {reports.length >= 1 && !selectMode ? (
            <button
              onClick={() => setSelectMode(true)}
              className="text-sm font-medium text-brand-primary-500 hover:text-brand-primary-600"
            >
              批量导出
            </button>
          ) : null}
          {selectMode ? (
            <button onClick={exitSelect} className="text-sm text-slate-400 hover:text-slate-600">
              取消
            </button>
          ) : (
            <button onClick={() => navigate('/app')} className="text-sm text-slate-400 hover:text-slate-600">
              返回中心
            </button>
          )}
        </div>
      </header>

      {selectMode ? (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3">
          <span className="text-sm text-slate-500">已选 {selected.size} 份</span>
          <SpringButton
            variant="accent"
            disabled={exporting || selected.size === 0}
            onClick={handleBatchExport}
          >
            {exporting ? '导出中…' : '导出所选'}
          </SpringButton>
        </div>
      ) : null}

      {exportError ? (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{exportError}</p>
      ) : null}

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
            const checked = selected.has(r.id);
            return (
              <button
                key={r.id}
                onClick={() => (selectMode ? toggle(r.id) : navigate(`/app/report/${r.id}`))}
                className={`flex items-center gap-4 rounded-2xl border p-5 text-left transition-shadow hover:shadow-md ${
                  checked ? 'border-brand-primary-400 ring-1 ring-brand-primary-300' : 'border-slate-200'
                }`}
              >
                {selectMode ? (
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs text-white ${
                      checked ? 'border-brand-primary-500 bg-brand-primary-500' : 'border-slate-300'
                    }`}
                    aria-hidden
                  >
                    {checked ? '✓' : ''}
                  </span>
                ) : null}
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
                {!selectMode ? <span className="text-slate-300">›</span> : null}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}