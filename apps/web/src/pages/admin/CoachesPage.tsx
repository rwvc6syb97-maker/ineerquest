/**
 * 运营后台 - 辅导师管理（T4-18 / P34）
 * -------------------------------------------------------------
 * - Tab「辅导师」：列表 + 审核（通过/驳回，驳回需 remark）+ 上下架（下架需 reason+confirm，可 force）。
 * - Tab「评价」：列表 + 回复 + 删除。
 * 审核/上下架受 coach:audit / coach:shelf；评价受 review:manage 权限门控制。
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminCoachesApi } from '../../api';
import type {
  CoachAuditStatus,
  CoachShelfStatus,
  AdminCoach,
  AdminReview,
} from '../../api/modules/admin-coaches.api';
import { Card } from '../../components/ui/Card';
import {
  StatusBadge,
  Pagination,
  ConfirmDialog,
  PermGate,
  useToast,
  errMsg,
} from './_shared';

const AUDIT_TEXT: Record<CoachAuditStatus, { text: string; tone: 'green' | 'red' | 'amber' }> = {
  0: { text: '待审', tone: 'amber' },
  1: { text: '通过', tone: 'green' },
  2: { text: '驳回', tone: 'red' },
};
const SHELF_TEXT: Record<CoachShelfStatus, { text: string; tone: 'green' | 'slate' }> = {
  1: { text: '已上架', tone: 'green' },
  0: { text: '已下架', tone: 'slate' },
};

type Tab = 'coaches' | 'reviews';

export function CoachesPage() {
  const [tab, setTab] = useState<Tab>('coaches');
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-slate-900">辅导师管理</h1>
      <div className="flex gap-2 border-b border-slate-200">
        {(['coaches', 'reviews'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'coaches' ? '辅导师' : '评价'}
          </button>
        ))}
      </div>
      {tab === 'coaches' ? <CoachesTab /> : <ReviewsTab />}
    </div>
  );
}

function CoachesTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [auditStatus, setAuditStatus] = useState<CoachAuditStatus | ''>('');

  const [auditTarget, setAuditTarget] = useState<AdminCoach | null>(null);
  const [auditPass, setAuditPass] = useState(true);
  const [remark, setRemark] = useState('');
  const [shelfTarget, setShelfTarget] = useState<AdminCoach | null>(null);
  const [shelfReason, setShelfReason] = useState('');
  const [force, setForce] = useState(false);

  const list = useQuery({
    queryKey: ['admin', 'coaches', { page, pageSize, auditStatus }],
    queryFn: () =>
      adminCoachesApi.listCoaches({
        page,
        pageSize,
        auditStatus: auditStatus === '' ? undefined : auditStatus,
      }),
  });

  const auditMut = useMutation({
    mutationFn: (c: AdminCoach) =>
      adminCoachesApi.auditCoach(c.id, {
        auditStatus: auditPass ? 1 : 2,
        remark: auditPass ? undefined : remark.trim(),
      }),
    onSuccess: () => {
      toast('审核完成');
      setAuditTarget(null);
      setRemark('');
      qc.invalidateQueries({ queryKey: ['admin', 'coaches'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const shelfMut = useMutation({
    mutationFn: (c: AdminCoach) => {
      const next: CoachShelfStatus = c.status === 1 ? 0 : 1;
      return adminCoachesApi.shelfCoach(c.id, {
        status: next,
        reason: next === 0 ? shelfReason.trim() : undefined,
        confirm: next === 0 ? true : undefined,
        force: next === 0 ? force : undefined,
      });
    },
    onSuccess: () => {
      toast('操作成功');
      setShelfTarget(null);
      setShelfReason('');
      setForce(false);
      qc.invalidateQueries({ queryKey: ['admin', 'coaches'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const rows = list.data?.list ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card padding="sm">
        <select
          value={auditStatus}
          onChange={(e) => {
            const v = e.target.value;
            setAuditStatus(v === '' ? '' : (Number(v) as CoachAuditStatus));
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">全部审核状态</option>
          <option value="0">待审</option>
          <option value="1">通过</option>
          <option value="2">驳回</option>
        </select>
      </Card>

      <Card padding="none">
        {list.isLoading ? (
          <p className="py-10 text-center text-sm text-slate-400">加载中…</p>
        ) : list.isError ? (
          <p className="py-10 text-center text-sm text-red-500">{errMsg(list.error, '加载失败')}</p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">暂无辅导师</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">姓名</th>
                  <th className="px-4 py-3">头衔</th>
                  <th className="px-4 py-3">价格</th>
                  <th className="px-4 py-3">审核</th>
                  <th className="px-4 py-3">上架</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800">{c.name}</td>
                    <td className="px-4 py-3 text-slate-600">{c.title}</td>
                    <td className="px-4 py-3 text-slate-600">¥{c.price}</td>
                    <td className="px-4 py-3">
                      <StatusBadge {...AUDIT_TEXT[c.auditStatus]} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge {...SHELF_TEXT[c.status]} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        {c.auditStatus === 0 && (
                          <PermGate need="coach:audit">
                            <button
                              type="button"
                              onClick={() => {
                                setAuditTarget(c);
                                setAuditPass(true);
                                setRemark('');
                              }}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              审核
                            </button>
                          </PermGate>
                        )}
                        {c.auditStatus === 1 && (
                          <PermGate need="coach:shelf">
                            <button
                              type="button"
                              onClick={() => {
                                setShelfTarget(c);
                                setShelfReason('');
                                setForce(false);
                              }}
                              className={`text-xs hover:underline ${
                                c.status === 1 ? 'text-red-600' : 'text-green-600'
                              }`}
                            >
                              {c.status === 1 ? '下架' : '上架'}
                            </button>
                          </PermGate>
                        )}
                      </div>
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

      {/* 审核弹窗 */}
      <ConfirmDialog
        open={!!auditTarget}
        title="审核辅导师"
        danger={!auditPass}
        confirmText="提交审核"
        loading={auditMut.isPending}
        onCancel={() => setAuditTarget(null)}
        onConfirm={() => {
          if (!auditPass && !remark.trim()) {
            toast('驳回需填写原因', 'error');
            return;
          }
          auditTarget && auditMut.mutate(auditTarget);
        }}
      >
        <div className="flex flex-col gap-3">
          <p>辅导师「{auditTarget?.name}」审核：</p>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input type="radio" checked={auditPass} onChange={() => setAuditPass(true)} /> 通过
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={!auditPass} onChange={() => setAuditPass(false)} /> 驳回
            </label>
          </div>
          {!auditPass && (
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="驳回原因（必填）"
              rows={3}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          )}
        </div>
      </ConfirmDialog>

      {/* 上下架弹窗 */}
      <ConfirmDialog
        open={!!shelfTarget}
        title={shelfTarget?.status === 1 ? '下架辅导师' : '上架辅导师'}
        danger={shelfTarget?.status === 1}
        confirmText="确认"
        loading={shelfMut.isPending}
        onCancel={() => setShelfTarget(null)}
        onConfirm={() => {
          if (shelfTarget?.status === 1 && !shelfReason.trim()) {
            toast('下架需填写原因', 'error');
            return;
          }
          shelfTarget && shelfMut.mutate(shelfTarget);
        }}
      >
        {shelfTarget?.status === 1 ? (
          <div className="flex flex-col gap-3">
            <p>确定下架「{shelfTarget?.name}」？</p>
            <textarea
              value={shelfReason}
              onChange={(e) => setShelfReason(e.target.value)}
              placeholder="下架原因（必填）"
              rows={3}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
              强制下架（无视进行中订单）
            </label>
          </div>
        ) : (
          <p>确定上架「{shelfTarget?.name}」？</p>
        )}
      </ConfirmDialog>
    </div>
  );
}

function ReviewsTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [replyTarget, setReplyTarget] = useState<AdminReview | null>(null);
  const [replyText, setReplyText] = useState('');
  const [delTarget, setDelTarget] = useState<AdminReview | null>(null);

  const list = useQuery({
    queryKey: ['admin', 'reviews', { page, pageSize }],
    queryFn: () => adminCoachesApi.listReviews({ page, pageSize }),
  });

  const replyMut = useMutation({
    mutationFn: (r: AdminReview) => adminCoachesApi.replyReview(r.id, replyText.trim()),
    onSuccess: () => {
      toast('回复成功');
      setReplyTarget(null);
      setReplyText('');
      qc.invalidateQueries({ queryKey: ['admin', 'reviews'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => adminCoachesApi.deleteReview(id),
    onSuccess: () => {
      toast('已删除');
      setDelTarget(null);
      qc.invalidateQueries({ queryKey: ['admin', 'reviews'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const rows = list.data?.list ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card padding="none">
        {list.isLoading ? (
          <p className="py-10 text-center text-sm text-slate-400">加载中…</p>
        ) : list.isError ? (
          <p className="py-10 text-center text-sm text-red-500">{errMsg(list.error, '加载失败')}</p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">暂无评价</p>
        ) : (
          <div className="flex flex-col divide-y divide-slate-100">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-col gap-1 px-4 py-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-slate-800">{r.userName}</span>
                  <span className="text-amber-500">{'★'.repeat(r.rating)}</span>
            <span className="text-xs text-slate-400">→ {r.coachName}</span>
                  <span className="ml-auto text-xs text-slate-400">{r.createdAt}</span>
                </div>
                <p className="text-sm text-slate-700">{r.content}</p>
                {r.reply && (
                  <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    官方回复：{r.reply}
                  </p>
                )}
                <PermGate need="review:manage">
                  <div className="mt-1 flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTarget(r);
                        setReplyText(r.reply ?? '');
                      }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {r.reply ? '修改回复' : '回复'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDelTarget(r)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      删除
                    </button>
                  </div>
                </PermGate>
              </div>
            ))}
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

      {/* 回复弹窗 */}
      <ConfirmDialog
        open={!!replyTarget}
      title="回复评价"
        danger={false}
        confirmText="提交"
        loading={replyMut.isPending}
        onCancel={() => setReplyTarget(null)}
        onConfirm={() => {
          if (!replyText.trim()) {
            toast('请填写回复内容', 'error');
            return;
          }
          replyTarget && replyMut.mutate(replyTarget);
        }}
      >
        <textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="回复内容"
          rows={4}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </ConfirmDialog>

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!delTarget}
        title="删除评价"
        confirmText="删除"
        loading={delMut.isPending}
        onCancel={() => setDelTarget(null)}
        onConfirm={() => delTarget && delMut.mutate(delTarget.id)}
      >
        确定删除该评价？该操作不可撤销。
      </ConfirmDialog>
    </div>
  );
}