/**
 * 运营后台 - 内容管理（T4-18 / P34）
 * -------------------------------------------------------------
 * - Tab「职业词条」：CRUD（career:read / career:write）。
 * - Tab「学习资源」：CRUD（resource:read / resource:write）。
 * - Tab「话题」：后端返回 501，捕获后展示「功能暂未开放」占位（不白屏）。
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { adminContentApi } from '../../api';
import type {
  ContentStatus,
  CareerItem,
  ResourceItem,
  UpsertCareerParams,
  UpsertResourceParams,
} from '../../api/modules/admin-content.api';
import { Card } from '../../components/ui/Card';
import {
  StatusBadge,
  Pagination,
  ConfirmDialog,
  PermGate,
  useToast,
  errMsg,
} from './_shared';

const STATUS_TEXT: Record<ContentStatus, { text: string; tone: 'green' | 'slate' }> = {
  1: { text: '上线', tone: 'green' },
  0: { text: '下线', tone: 'slate' },
};

type Tab = 'careers' | 'resources' | 'topics';

export function ContentPage() {
  const [tab, setTab] = useState<Tab>('careers');
  const tabs: { key: Tab; label: string }[] = [
    { key: 'careers', label: '职业词条' },
    { key: 'resources', label: '学习资源' },
    { key: 'topics', label: '话题' },
  ];
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-slate-900">内容管理</h1>
      <div className="flex gap-2 border-b border-slate-200">
        {tabs.map((t) => (
          <button
        key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'careers' && <CareersTab />}
      {tab === 'resources' && <ResourcesTab />}
      {tab === 'topics' && <TopicsTab />}
    </div>
  );
}

function CareersTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [editing, setEditing] = useState<CareerItem | 'new' | null>(null);
  const [delTarget, setDelTarget] = useState<CareerItem | null>(null);

  const list = useQuery({
    queryKey: ['admin', 'careers', { page, pageSize }],
    queryFn: () => adminContentApi.listCareers({ page, pageSize }),
  });

  const { register, handleSubmit, reset } = useForm<UpsertCareerParams>();

  const saveMut = useMutation({
    mutationFn: (data: UpsertCareerParams) =>
      editing === 'new'
        ? adminContentApi.createCareer(data)
        : adminContentApi.updateCareer((editing as CareerItem).id, data),
    onSuccess: () => {
      toast('保存成功');
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['admin', 'careers'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => adminContentApi.deleteCareer(id),
    onSuccess: () => {
      toast('已删除');
      setDelTarget(null);
      qc.invalidateQueries({ queryKey: ['admin', 'careers'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const openEdit = (item: CareerItem | 'new') => {
    if (item === 'new') {
      reset({ name: '', category: '', summary: '', status: 1 });
    } else {
      reset({
        name: item.name,
        category: item.category,
        summary: item.summary,
        content: item.content,
        status: item.status,
      });
    }
    setEditing(item);
  };

  const rows = list.data?.list ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PermGate need="career:write">
        <button
          type="button"
          onClick={() => openEdit('new')}
          className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          新增词条
        </button>
      </PermGate>

      <Card padding="none">
        {list.isLoading ? (
          <p className="py-10 text-center text-sm text-slate-400">加载中…</p>
        ) : list.isError ? (
          <p className="py-10 text-center text-sm text-red-500">{errMsg(list.error, '加载失败')}</p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">暂无词条</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">名称</th>
                  <th className="px-4 py-3">类别</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800">{c.name}</td>
                    <td className="px-4 py-3 text-slate-600">{c.category}</td>
                    <td className="px-4 py-3">
                      <StatusBadge {...STATUS_TEXT[c.status]} />
                    </td>
                    <td className="px-4 py-3">
                      <PermGate need="career:write">
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => setDelTarget(c)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            删除
                          </button>
                        </div>
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

      {/* 编辑弹窗 */}
      <ConfirmDialog
        open={!!editing}
        title={editing === 'new' ? '新增职业词条' : '编辑职业词条'}
        danger={false}
        confirmText="保存"
        loading={saveMut.isPending}
        onCancel={() => setEditing(null)}
        onConfirm={handleSubmit((data) => saveMut.mutate(data))}
      >
        <div className="flex flex-col gap-3">
          <input
            {...register('name', { required: true })}
            placeholder="职业名称"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            {...register('category', { required: true })}
            placeholder="所属类别"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <textarea
            {...register('summary', { required: true })}
            placeholder="简介"
            rows={2}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <textarea
            {...register('content')}
            placeholder="详情正文（可选）"
            rows={4}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            {...register('status', { valueAsNumber: true })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value={1}>上线</option>
            <option value={0}>下线</option>
          </select>
        </div>
      </ConfirmDialog>

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!delTarget}
        title="删除词条"
        confirmText="删除"
        loading={delMut.isPending}
        onCancel={() => setDelTarget(null)}
        onConfirm={() => delTarget && delMut.mutate(delTarget.id)}
      >
        确定删除「{delTarget?.name}」？该操作不可撤销。
      </ConfirmDialog>
    </div>
  );
}

function ResourcesTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [editing, setEditing] = useState<ResourceItem | 'new' | null>(null);
  const [delTarget, setDelTarget] = useState<ResourceItem | null>(null);

  const list = useQuery({
    queryKey: ['admin', 'resources', { page, pageSize }],
    queryFn: () => adminContentApi.listResources({ page, pageSize }),
  });

  const { register, handleSubmit, reset } = useForm<UpsertResourceParams>();

  const saveMut = useMutation({
    mutationFn: (data: UpsertResourceParams) =>
      editing === 'new'
        ? adminContentApi.createResource(data)
        : adminContentApi.updateResource((editing as ResourceItem).id, data),
    onSuccess: () => {
      toast('保存成功');
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['admin', 'resources'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => adminContentApi.deleteResource(id),
    onSuccess: () => {
      toast('已删除');
      setDelTarget(null);
      qc.invalidateQueries({ queryKey: ['admin', 'resources'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const openEdit = (item: ResourceItem | 'new') => {
    if (item === 'new') {
      reset({ title: '', type: '', status: 1 });
    } else {
      reset({
        title: item.title,
        type: item.type,
        url: item.url,
        cover: item.cover,
        summary: item.summary,
        status: item.status,
      });
    }
    setEditing(item);
  };

  const rows = list.data?.list ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PermGate need="resource:write">
        <button
          type="button"
          onClick={() => openEdit('new')}
          className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
       >
          新增资源
        </button>
      </PermGate>

      <Card padding="none">
        {list.isLoading ? (
          <p className="py-10 text-center text-sm text-slate-400">加载中…</p>
        ) : list.isError ? (
          <p className="py-10 text-center text-sm text-red-500">{errMsg(list.error, '加载失败')}</p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">暂无资源</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">标题</th>
                  <th className="px-4 py-3">类型</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800">{r.title}</td>
                    <td className="px-4 py-3 text-slate-600">{r.type}</td>
                    <td className="px-4 py-3">
                      <StatusBadge {...STATUS_TEXT[r.status]} />
                 </td>
                    <td className="px-4 py-3">
                      <PermGate need="resource:write">
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => openEdit(r)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            编辑
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

      {/* 编辑弹窗 */}
      <ConfirmDialog
        open={!!editing}
        title={editing === 'new' ? '新增学习资源' : '编辑学习资源'}
        danger={false}
        confirmText="保存"
        loading={saveMut.isPending}
        onCancel={() => setEditing(null)}
        onConfirm={handleSubmit((data) => saveMut.mutate(data))}
      >
        <div className="flex flex-col gap-3">
          <input
            {...register('title', { required: true })}
            placeholder="标题"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            {...register('type', { required: true })}
            placeholder="类型（文章/视频/书籍）"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            {...register('url')}
            placeholder="外链 URL（可选）"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <textarea
            {...register('summary')}
            placeholder="简介（可选）"
            rows={2}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            {...register('status', { valueAsNumber: true })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value={1}>上线</option>
            <option value={0}>下线</option>
          </select>
        </div>
      </ConfirmDialog>

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!delTarget}
        title="删除资源"
        confirmText="删除"
        loading={delMut.isPending}
        onCancel={() => setDelTarget(null)}
        onConfirm={() => delTarget && delMut.mutate(delTarget.id)}
      >
        确定删除「{delTarget?.title}」？该操作不可撤销。
      </ConfirmDialog>
    </div>
  );
}

function TopicsTab() {
  // 后端 topics 返回 501，捕获后展示占位，避免白屏。
  const q = useQuery({
    queryKey: ['admin', 'topics'],
    queryFn: () => adminContentApi.listTopics(),
    retry: false,
  });

  return (
    <Card>
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <p className="text-base font-medium text-slate-700">功能暂未开放</p>
        <p className="text-sm text-slate-400">
          {q.isError ? '话题管理后端尚未实现（501），敬请期待。' : '加载中…'}
        </p>
      </div>
    </Card>
  );
}