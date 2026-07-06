/**
 * 运营后台页面共享小组件（局部，非全局 UI 库）
 * -------------------------------------------------------------
 * - StatusBadge     状态徽标
 * - Pagination      简易分页条
 * - ConfirmDialog   危险操作二次确认弹窗（ban/下架/删除）
 * - PermGate        权限门（无权限则不渲染子节点，用于按钮级隐藏）
 * - useToast/Toaster 极简轻提示（无第三方 toast 库时的兜底）
 * - errMsg          ApiError 文案提取
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '../../api';
import { useAdminAuthStore } from '../../stores/adminAuth.store';

export function errMsg(err: unknown, fallback = '操作失败'): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function StatusBadge({
  text,
  tone = 'slate',
}: {
  text: string;
  tone?: 'green' | 'red' | 'amber' | 'slate' | 'blue';
}) {
  const map: Record<string, string> = {
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    slate: 'bg-slate-100 text-slate-600',
    blue: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs ${map[tone]}`}>{text}</span>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between px-1 py-3 text-sm text-slate-500">
      <span>
        共 {total.toLocaleString()} 条 · 第 {page}/{totalPages} 页
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
        >
          上一页
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
        >
          下一页
        </button>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmText = '确认',
  loading = false,
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmText?: string;
  loading?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <div className="mt-3 text-sm text-slate-600">{children}</div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
            danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? '处理中…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 权限门：无权限点则不渲染（按钮级隐藏，最终以后端为准） */
export function PermGate({ need, children }: { need: string; children: ReactNode }) {
  const hasPerm = useAdminAuthStore((s) => s.hasPerm);
  if (!hasPerm(need)) return null;
  return <>{children}</>;
}

// -------- 极简 Toast（无第三方库兜底） --------
interface ToastItem {
  id: number;
  text: string;
  tone: 'success' | 'error';
}

let toastSeq = 0;
const listeners = new Set<(items: ToastItem[]) => void>();
let store: ToastItem[] = [];

function emit() {
  listeners.forEach((l) => l([...store]));
}

export function toast(text: string, tone: 'success' | 'error' = 'success') {
  const item: ToastItem = { id: ++toastSeq, text, tone };
  store = [...store, item];
  emit();
  setTimeout(() => {
    store = store.filter((t) => t.id !== item.id);
    emit();
  }, 2600);
}

export function useToast() {
  return useCallback((text: string, tone: 'success' | 'error' = 'success') => toast(text, tone), []);
}

/** 全局挂载一次，渲染 toast 队列 */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>(store);
  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);
  return (
    <div className="fixed left-1/2 top-4 z-[60] flex -translate-x-1/2 flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg px-4 py-2 text-sm text-white shadow-lg ${
          t.tone === 'error' ? 'bg-red-600' : 'bg-slate-900'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}