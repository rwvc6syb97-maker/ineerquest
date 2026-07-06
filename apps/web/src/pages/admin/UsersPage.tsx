/**
 * 运营后台 - 用户管理（T4-18 / P34）
 * -------------------------------------------------------------
 * - 列表：status/role/keyword 筛选 + 分页（user:read）。
 * - 手机号脱敏展示；masked=true 时提示需 user:pii 权限查看明文。
 * - 封禁：reason 必填 + confirm=true 二次确认（user:ban）。
 * - 解封：二次确认（user:ban）。
 * 写操作按钮受 user:ban 权限门控制显隐。
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminUsersApi } from '../../api';
import type { UserStatus, AdminUser } from '../../api/modules/admin-users.api';
import { Card } from '../../components/ui/Card';
import {
  StatusBadge,
  Pagination,
  ConfirmDialog,
  PermGate,
  useToast,
  errMsg,
} from './_shared';

const STATUS_TEXT: Record<UserStatus, { text: string; tone: 'green' | 'red' | 'amber' }> = {
  1: { text: '正常', tone: 'green' },
  0: { text: '封禁', tone: 'red' },
  2: { text: '注销中', tone: 'amber' },
};

export function UsersPage() {
  const qc = useQueryClient();
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [keyword, setKeyword] = useState('');
  const [kwInput, setKwInput] = useState('');

  const [banTarget, setBanTarget] = useState<AdminUser | null>(null);
  const [banReason, setBanReason] = useState('');
  const [unbanTarget, setUnbanTarget] = useState<AdminUser | null>(null);

  const list = useQuery({
    queryKey: ['admin', 'users', { page, pageSize, status, keyword }],
    queryFn: () =>
      adminUsersApi.listUsers({
        page,
        pageSize,
        status: status === '' ? undefined : status,
        keyword: keyword || undefined,
      }),
  });

  const banMut = useMutation({
    mutationFn: (id: string) =>
      adminUsersApi.banUser(id, { reason: banReason.trim(), confirm: true }),
    onSuccess: () => {
      toast('已封禁');
      setBanTarget(null);
      setBanReason('');
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const unbanMut = useMutation({
    mutationFn: (id: string) => adminUsersApi.unbanUser(id),
    onSuccess: () => {
      toast('已解封');
      setUnbanTarget(null);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const rows = list.data?.list ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-slate-900">用户管理</h1>

      {/* 筛选 */}
      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={status}
            onChange={(e) => {
              const v = e.target.value;
              setStatus(v === '' ? '' : (Number(v) as UserStatus));
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">全部状态</option>
            <option value="1">正常</option>
            <option value="0">封禁</option>
            <option value="2">注销中</option>
          </select>
          <input
            value={kwInput}
            onChange={(e) => setKwInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setKeyword(kwInput.trim());
                setPage(1);
              }
            }}
            placeholder="搜索昵称/手机号，回车"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              setKeyword(kwInput.trim());
              setPage(1);
            }}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            搜索
          </button>
        </div>
      </Card>

      {/* 列表 */}
      <Card padding="none">
        {list.isLoading ? (
          <p className="py-10 text-center text-sm text-slate-400">加载中…</p>
        ) : list.isError ? (
          <p className="py-10 text-center text-sm text-red-500">{errMsg(list.error, '用户加载失败')}</p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">暂无用户</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">昵称</th>
                  <th className="px-4 py-3">手机号</th>
                  <th className="px-4 py-3">付费</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">注册时间</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800">{u.nickname}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {u.phone}
                      {u.masked && (
                        <span className="ml-1 text-xs text-slate-400" title="需 user:pii 权限查看明文">
                          （脱敏）
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{u.paid ? '是' : '否'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge {...STATUS_TEXT[u.status]} />
                    </td>
                    <td className="px-4 py-3 text-slate-500">{u.registeredAt}</td>
                    <td className="px-4 py-3">
                      <PermGate need="user:ban">
                        {u.status === 0 ? (
                          <button
                            type="button"
                            onClick={() => setUnbanTarget(u)}
                            className="text-xs text-green-600 hover:underline"
                          >
                            解封
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setBanTarget(u)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            封禁
                          </button>
                        )}
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

      {/* 封禁确认 */}
      <ConfirmDialog
        open={!!banTarget}
        title="封禁用户"
        confirmText="确认封禁"
        loading={banMut.isPending}
        onCancel={() => {
          setBanTarget(null);
          setBanReason('');
        }}
        onConfirm={() => {
          if (!banReason.trim()) {
            toast('请填写封禁原因', 'error');
            return;
          }
          banTarget && banMut.mutate(banTarget.id);
        }}
      >
        <div className="flex flex-col gap-3">
          <p>
            确定封禁用户「{banTarget?.nickname}」？封禁后该用户将无法登录。
          </p>
          <textarea
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
            placeholder="封禁原因（必填）"
            rows={3}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </ConfirmDialog>

      {/* 解封确认 */}
      <ConfirmDialog
        open={!!unbanTarget}
        title="解封用户"
        danger={false}
        confirmText="确认解封"
        loading={unbanMut.isPending}
        onCancel={() => setUnbanTarget(null)}
        onConfirm={() => unbanTarget && unbanMut.mutate(unbanTarget.id)}
      >
        确定解封用户「{unbanTarget?.nickname}」？
      </ConfirmDialog>
    </div>
  );
}