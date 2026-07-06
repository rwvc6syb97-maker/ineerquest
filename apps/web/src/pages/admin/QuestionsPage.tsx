/**
 * 运营后台 - 题库管理（T4-18 / P33）
 * -------------------------------------------------------------
 * - 列表：version/status/dimension 筛选 + 分页（question:read）。
 * - 批量改状态：多选 + reason 必填（question:write，对齐 BatchStatusDto）。
 * - 删除：二次确认（question:write）。
 * - 写操作按钮受 question:write 权限门控制显隐。
 * 新增/编辑表单从简（题干/维度/版本/状态），选项编辑留待后续增强。
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminQuestionsApi } from '../../api';
import type {
  QuestionDimension,
  QuestionStatus,
  AdminQuestion,
} from '../../api/modules/admin-questions.api';
import { Card } from '../../components/ui/Card';
import {
  StatusBadge,
  Pagination,
  ConfirmDialog,
  PermGate,
  useToast,
  errMsg,
} from './_shared';

const DIMENSIONS: QuestionDimension[] = ['EI', 'SN', 'TF', 'JP'];
const STATUS_TEXT: Record<QuestionStatus, { text: string; tone: 'green' | 'slate' | 'amber' }> = {
  1: { text: '启用', tone: 'green' },
  0: { text: '停用', tone: 'slate' },
  2: { text: '草稿', tone: 'amber' },
};

export function QuestionsPage() {
  const qc = useQueryClient();
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [dimension, setDimension] = useState<QuestionDimension | ''>('');
  const [status, setStatus] = useState<QuestionStatus | ''>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchReason, setBatchReason] = useState('');
  const [batchTarget, setBatchTarget] = useState<QuestionStatus>(1);
  const [delTarget, setDelTarget] = useState<AdminQuestion | null>(null);

  const list = useQuery({
    queryKey: ['admin', 'questions', { page, pageSize, dimension, status }],
    queryFn: () =>
      adminQuestionsApi.listQuestions({
        page,
        pageSize,
        dimension: dimension || undefined,
        status: status === '' ? undefined : status,
      }),
  });

  const batchMut = useMutation({
    mutationFn: () =>
      adminQuestionsApi.batchStatus({
        ids: Array.from(selected),
        status: batchTarget,
        reason: batchReason.trim(),
      }),
    onSuccess: () => {
      toast('批量操作成功');
      setBatchOpen(false);
      setBatchReason('');
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['admin', 'questions'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => adminQuestionsApi.deleteQuestion(id),
    onSuccess: () => {
      toast('删除成功');
      setDelTarget(null);
      qc.invalidateQueries({ queryKey: ['admin', 'questions'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const rows = list.data?.list ?? [];

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">题库管理</h1>
      </div>

      {/* 筛选 */}
      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={dimension}
            onChange={(e) => {
              setDimension(e.target.value as QuestionDimension | '');
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">全部维度</option>
            {DIMENSIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => {
              const v = e.target.value;
              setStatus(v === '' ? '' : (Number(v) as QuestionStatus));
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">全状态</option>
            <option value="1">启用</option>
            <option value="0">停用</option>
            <option value="2">草稿</option>
          </select>

          <PermGate need="question:write">
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={() => setBatchOpen(true)}
              className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              批量改状态（{selected.size}）
            </button>
          </PermGate>
        </div>
      </Card>

      {/* 列表 */}
      <Card padding="none">
        {list.isLoading ? (
          <p className="py-10 text-center text-sm text-slate-400">加载中…</p>
        ) : list.isError ? (
          <p className="py-10 text-center text-sm text-red-500">{errMsg(list.error, '题库加载失败')}</p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">暂无题目</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
                <tr>
                  <th className="w-10 px-4 py-3" />
                  <th className="px-4 py-3">题干</th>
                  <th className="px-4 py-3">维度</th>
                  <th className="px-4 py-3">版本</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((q) => (
                  <tr key={q.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(q.id)}
                        onChange={() => toggle(q.id)}
                      />
                    </td>
                    <td className="max-w-md truncate px-4 py-3 text-slate-800">{q.content}</td>
                    <td className="px-4 py-3">{q.dimension}</td>
                    <td className="px-4 py-3 text-slate-500">{q.version}</td>
                    <td className="px-4 py-3">
                      <StatusBadge {...STATUS_TEXT[q.status]} />
                    </td>
                    <td className="px-4 py-3">
                      <PermGate need="question:write">
                        <button
                          type="button"
                          onClick={() => setDelTarget(q)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          删除
                        </button>
                      </PermGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4">
              <Pagination
                page={page}
                pageSize={pageSize}
                total={list.data?.total ?? 0}
                onChange={setPage}
              />
            </div>
          </div>
        )}
      </Card>

      {/* 批量改状态确认 */}
      <ConfirmDialog
        open={batchOpen}
        title="批量修改状态"
        danger={false}
        confirmText="提交"
        loading={batchMut.isPending}
        onCancel={() => setBatchOpen(false)}
        onConfirm={() => {
          if (!batchReason.trim()) {
            toast('请填写变更原因', 'error');
            return;
          }
          batchMut.mutate();
        }}
      >
        <div className="flex flex-col gap-3">
          <p>已选 {selected.size} 道题目，将统一设为：</p>
          <select
            value={batchTarget}
            onChange={(e) => setBatchTarget(Number(e.target.value) as QuestionStatus)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="1">启用</option>
            <option value="0">停用</option>
            <option value="2">草稿</option>
          </select>
          <textarea
            value={batchReason}
            onChange={(e) => setBatchReason(e.target.value)}
            placeholder="变更原因（必填）"
            rows={3}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </ConfirmDialog>

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!delTarget}
        title="删除题目"
        confirmText="删除"
        loading={delMut.isPending}
        onCancel={() => setDelTarget(null)}
        onConfirm={() => delTarget && delMut.mutate(delTarget.id)}
      >
        确定删除题目「{delTarget?.content}」？该操作不可撤销。
      </ConfirmDialog>
    </div>
  );
}