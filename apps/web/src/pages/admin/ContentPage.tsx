/**
 * 运营后台 - 内容管理（M1 内容可持续化）
 * -------------------------------------------------------------
 * - Tab「职业词条」：CRUD（career:read/write）+ 审核上下线 + CSV 导入导出。
 * - Tab「学习资源」：CRUD（resource:read/write）+ 审核上下线 + CSV 导入导出。
 * - Tab「检索任务」：AI 检索任务 CRUD + 手动触发（content:manage）。
 * - Tab「话题」：CRUD + 审核（topic:review）。
 * 铁律：字段严格对齐后端 DTO；接口失败走错误态，禁止 mock 兜底；data 可选判空。
 */
import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { adminContentApi, contentSourceApi } from '../../api';
import type {
  ContentStatus,
  CareerItem,
  ResourceItem,
  CreateCareerParams,
  CreateResourceParams,
  TopicItem,
  CreateTopicParams,
} from '../../api/modules/admin-content.api';
import type { SourceTaskItem, CreateSourceTaskParams } from '../../api/modules/content-source.api';
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

/** 触发浏览器下载 Blob */
function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 读取文件为 UTF-8 文本（CSV 导入用，非 multipart） */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

/** CSV 导入/导出工具条（PermGate 包裹） */
function CsvToolbar(props: {
  perm: string;
  importing?: boolean;
  exporting?: boolean;
  onImport: (content: string) => void;
  onExport: () => void;
}) {
  const { perm, importing, exporting, onImport, onExport } = props;
  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await readFileAsText(file);
    onImport(text);
    e.target.value = '';
  };
  return (
    <PermGate need={perm}>
      <div className="inline-flex items-center gap-2">
        <label className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
          {importing ? '导入中…' : '导入 CSV'}
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
        </label>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {exporting ? '导出中…' : '导出 CSV'}
        </button>
      </div>
    </PermGate>
  );
}

type Tab = 'careers' | 'resources' | 'tasks' | 'topics';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'careers', label: '职业词条' },
  { key: 'resources', label: '学习资源' },
  { key: 'tasks', label: '检索任务' },
  { key: 'topics', label: '话题' },
];

export function ContentPage() {
  const [tab, setTab] = useState<Tab>('careers');
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">内容管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          职业库 / 学习资源 / AI 检索任务 / 话题的维护与审核。
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              'px-4 py-2 text-sm font-medium transition ' +
              (tab === t.key
                ? 'border-b-2 border-orange-500 text-orange-600'
                : 'text-slate-500 hover:text-slate-700')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'careers' && <CareersTab />}
      {tab === 'resources' && <ResourcesTab />}
      {tab === 'tasks' && <TasksTab />}
      {tab === 'topics' && <TopicsTab />}
    </div>
  );
}

// ==================== 职业词条 Tab ====================

function CareersTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<CareerItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [delTarget, setDelTarget] = useState<CareerItem | null>(null);

  const list = useQuery({
    queryKey: ['admin-careers', page, keyword],
    queryFn: () =>
      adminContentApi.listCareers({ page, pageSize, keyword: keyword || undefined }),
  });
  const rows = list.data?.list ?? [];
  const total = list.data?.total ?? 0;

  const { register, handleSubmit, reset } = useForm<CreateCareerParams>();

  const openCreate = () => {
    setEditing(null);
    reset({
      careerCode: '',
      name: '',
      category: '',
      description: '',
      responsibility: '',
      prospect: '',
      suitTypes: '',
      status: 1,
    });
    setShowForm(true);
  };
  const openEdit = (item: CareerItem) => {
    setEditing(item);
    reset({
      careerCode: item.careerCode,
      name: item.name,
      category: item.category,
      description: item.description ?? '',
      responsibility: item.responsibility ?? '',
      salaryMin: item.salaryMin ?? undefined,
      salaryMax: item.salaryMax ?? undefined,
      prospect: item.prospect ?? '',
      suitTypes: item.suitTypes ?? '',
      status: item.status,
    });
    setShowForm(true);
  };

  const saveMut = useMutation({
    mutationFn: (v: CreateCareerParams) => {
      const payload = { ...v };
      if (Number.isNaN(payload.salaryMin)) delete payload.salaryMin;
      if (Number.isNaN(payload.salaryMax)) delete payload.salaryMax;
      return editing
        ? adminContentApi.updateCareer(editing.id, payload)
        : adminContentApi.createCareer(payload);
    },
    onSuccess: () => {
      toast(editing ? '已保存' : '已新增');
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['admin-careers'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const reviewMut = useMutation({
    mutationFn: (item: CareerItem) =>
      contentSourceApi.reviewCareer(item.id, { reviewStatus: item.status === 0 ? 2 : 3 }),
    onSuccess: () => {
      toast('已更新状态');
      qc.invalidateQueries({ queryKey: ['admin-careers'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const delMut = useMutation({
    mutationFn: (item: CareerItem) => adminContentApi.deleteCareer(item.id),
    onSuccess: () => {
      toast('已删除');
      setDelTarget(null);
      qc.invalidateQueries({ queryKey: ['admin-careers'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const importMut = useMutation({
    mutationFn: (content: string) => contentSourceApi.importCareers(content),
    onSuccess: (r) => {
      toast(`导入完成：成功 ${r.inserted ?? 0} / 失败 ${r.failCount ?? 0}`);
      qc.invalidateQueries({ queryKey: ['admin-careers'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });
  const exportMut = useMutation({
    mutationFn: () => contentSourceApi.exportCareers(),
    onSuccess: (blob) => downloadBlob(blob, 'careers.csv'),
    onError: (e) => toast(errMsg(e), 'error'),
  });

  return (
    <Card padding="none">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <input
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setPage(1);
          }}
          placeholder="搜索职业名称/编码"
          className="w-56 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <div className="ml-auto flex items-center gap-2">
          <CsvToolbar
            perm="career:write"
            importing={importMut.isPending}
            exporting={exportMut.isPending}
            onImport={(c) => importMut.mutate(c)}
            onExport={() => exportMut.mutate()}
          />
          <PermGate need="career:write">
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
            >
              新增职业
            </button>
          </PermGate>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3">编码</th>
              <th className="px-4 py-3">名称</th>
              <th className="px-4 py-3">分类</th>
              <th className="px-4 py-3">薪资</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  加载中…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  暂无数据
                </td>
              </tr>
            ) : (
              rows.map((item) => {
                const st = STATUS_TEXT[item.status] ?? STATUS_TEXT[0];
                return (
                  <tr key={item.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {item.careerCode}
                    </td>
                    <td className="px-4 py-3 text-slate-800">{item.name}</td>
                    <td className="px-4 py-3 text-slate-600">{item.category}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.salaryMin != null || item.salaryMax != null
                        ? `${item.salaryMin ?? '—'} ~ ${item.salaryMax ?? '—'}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge text={st.text} tone={st.tone} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <PermGate need="career:write">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="text-slate-500 hover:text-orange-600"
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => reviewMut.mutate(item)}
                            disabled={reviewMut.isPending}
                            className="text-slate-500 hover:text-orange-600 disabled:opacity-50"
                          >
                            {item.status === 0 ? '上线' : '下线'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDelTarget(item)}
                            className="text-red-500 hover:text-red-700"
                          >
                            删除
                          </button>
                        </PermGate>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">
              {editing ? '编辑职业' : '新增职业'}
            </h3>
            <form
              onSubmit={handleSubmit((v) => saveMut.mutate(v))}
              className="mt-4 grid grid-cols-2 gap-3 text-sm"
            >
              <label className="col-span-1 flex flex-col gap-1">
                <span className="text-slate-500">编码 *</span>
                <input
                  {...register('careerCode', { required: true })}
                  disabled={!!editing}
                  className="rounded-lg border border-slate-200 px-3 py-2 disabled:bg-slate-50"
                />
              </label>
              <label className="col-span-1 flex flex-col gap-1">
                <span className="text-slate-500">名称 *</span>
                <input
                  {...register('name', { required: true })}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="col-span-1 flex flex-col gap-1">
                <span className="text-slate-500">分类 *</span>
                <input
                  {...register('category', { required: true })}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="col-span-1 flex flex-col gap-1">
                <span className="text-slate-500">适配 MBTI（逗号分隔）</span>
                <input
                  {...register('suitTypes')}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="col-span-1 flex flex-col gap-1">
                <span className="text-slate-500">薪资下限</span>
                <input
                  type="number"
                  {...register('salaryMin', { valueAsNumber: true })}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="col-span-1 flex flex-col gap-1">
                <span className="text-slate-500">薪资上限</span>
                <input
                  type="number"
                  {...register('salaryMax', { valueAsNumber: true })}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-slate-500">职责描述</span>
                <textarea
                  {...register('responsibility')}
                  rows={2}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-slate-500">发展前景</span>
                <textarea
                  {...register('prospect')}
                  rows={2}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <div className="col-span-2 mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saveMut.isPending}
                  className="rounded-lg bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  {saveMut.isPending ? '保存中…' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!delTarget}
        title="删除职业"
        loading={delMut.isPending}
        confirmText="确认删除"
        onCancel={() => setDelTarget(null)}
        onConfirm={() => delTarget && delMut.mutate(delTarget)}
      >
        确认删除「{delTarget?.name}」？此操作不可恢复。
      </ConfirmDialog>
    </Card>
  );
}

// ==================== 学习资源 Tab ====================

function ResourcesTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<ResourceItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [delTarget, setDelTarget] = useState<ResourceItem | null>(null);

  const list = useQuery({
    queryKey: ['admin-resources', page, keyword],
    queryFn: () =>
      adminContentApi.listResources({ page, pageSize, keyword: keyword || undefined }),
  });
  const rows = list.data?.list ?? [];
  const total = list.data?.total ?? 0;

  const { register, handleSubmit, reset } = useForm<CreateResourceParams>();

  const openCreate = () => {
    setEditing(null);
    reset({ title: '', resourceType: 1, url: '', skillTags: '', careerId: '', provider: '', status: 1 });
    setShowForm(true);
  };
  const openEdit = (item: ResourceItem) => {
    setEditing(item);
    reset({
      title: item.title,
      resourceType: item.resourceType,
      url: item.url ?? '',
      skillTags: item.skillTags ?? '',
      careerId: item.careerId ?? '',
      provider: item.provider ?? '',
      status: item.status,
    });
    setShowForm(true);
  };

  const saveMut = useMutation({
    mutationFn: (v: CreateResourceParams) => {
      const payload = { ...v, resourceType: Number(v.resourceType) };
      if (!payload.careerId) delete payload.careerId;
      return editing
        ? adminContentApi.updateResource(editing.id, payload)
        : adminContentApi.createResource(payload);
    },
    onSuccess: () => {
      toast(editing ? '已保存' : '已新增');
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['admin-resources'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const reviewMut = useMutation({
    mutationFn: (item: ResourceItem) =>
      contentSourceApi.reviewResource(item.id, { reviewStatus: item.status === 0 ? 2 : 3 }),
    onSuccess: () => {
      toast('已更新状态');
      qc.invalidateQueries({ queryKey: ['admin-resources'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const delMut = useMutation({
    mutationFn: (item: ResourceItem) => adminContentApi.deleteResource(item.id),
    onSuccess: () => {
      toast('已删除');
      setDelTarget(null);
      qc.invalidateQueries({ queryKey: ['admin-resources'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const importMut = useMutation({
    mutationFn: (content: string) => contentSourceApi.importResources(content),
    onSuccess: (r) => {
      toast(`导入完成：成功 ${r.inserted ?? 0} / 失败 ${r.failCount ?? 0}`);
      qc.invalidateQueries({ queryKey: ['admin-resources'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });
  const exportMut = useMutation({
    mutationFn: () => contentSourceApi.exportResources(),
    onSuccess: (blob) => downloadBlob(blob, 'resources.csv'),
    onError: (e) => toast(errMsg(e), 'error'),
  });

  return (
    <Card padding="none">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <input
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setPage(1);
          }}
          placeholder="搜索资源标题"
          className="w-56 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <div className="ml-auto flex items-center gap-2">
          <CsvToolbar
            perm="resource:write"
            importing={importMut.isPending}
            exporting={exportMut.isPending}
            onImport={(c) => importMut.mutate(c)}
            onExport={() => exportMut.mutate()}
          />
          <PermGate need="resource:write">
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
            >
              新增资源
            </button>
          </PermGate>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3">标题</th>
              <th className="px-4 py-3">类型</th>
              <th className="px-4 py-3">提供方</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  加载中…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
             <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  暂无数据
                </td>
              </tr>
            ) : (
              rows.map((item) => {
                const st = STATUS_TEXT[item.status] ?? STATUS_TEXT[0];
                return (
                  <tr key={item.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-slate-800">{item.title}</td>
                    <td className="px-4 py-3 text-slate-600">{item.resourceType}</td>
                    <td className="px-4 py-3 text-slate-600">{item.provider ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge text={st.text} tone={st.tone} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <PermGate need="resource:write">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="text-slate-500 hover:text-orange-600"
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => reviewMut.mutate(item)}
                            disabled={reviewMut.isPending}
                            className="text-slate-500 hover:text-orange-600 disabled:opacity-50"
                          >
                            {item.status === 0 ? '上线' : '下线'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDelTarget(item)}
                            className="text-red-500 hover:text-red-700"
                          >
                            删除
                          </button>
                        </PermGate>
                      </div>
                    </td>
               </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">
              {editing ? '编辑资源' : '新增资源'}
            </h3>
            <form
              onSubmit={handleSubmit((v) => saveMut.mutate(v))}
              className="mt-4 grid grid-cols-2 gap-3 text-sm"
            >
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-slate-500">标题 *</span>
                <input
                  {...register('title', { required: true })}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="col-span-1 flex flex-col gap-1">
                <span className="text-slate-500">类型（数字枚举）*</span>
                <input
                  type="number"
                  {...register('resourceType', { required: true, valueAsNumber: true })}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="col-span-1 flex flex-col gap-1">
                <span className="text-slate-500">提供方</span>
                <input
                  {...register('provider')}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-slate-500">链接 URL</span>
                <input
                  {...register('url')}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="col-span-1 flex flex-col gap-1">
                <span className="text-slate-500">技能标签（逗号分隔）</span>
                <input
                  {...register('skillTags')}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="col-span-1 flex flex-col gap-1">
                <span className="text-slate-500">关联职业 ID</span>
                <input
                  {...register('careerId')}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <div className="col-span-2 mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50"
                >
            取消
                </button>
                <button
                  type="submit"
                  disabled={saveMut.isPending}
                  className="rounded-lg bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  {saveMut.isPending ? '保存中…' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!delTarget}
        title="删除资源"
        loading={delMut.isPending}
        confirmText="确认删除"
        onCancel={() => setDelTarget(null)}
        onConfirm={() => delTarget && delMut.mutate(delTarget)}
      >
        确认删除「{delTarget?.title}」？此操作不可恢复。
      </ConfirmDialog>
    </Card>
  );
}

// ==================== 检索任务 Tab ====================

const TASK_STATUS_TEXT: Record<number, { text: string; tone: 'green' | 'slate' | 'amber' | 'red' }> = {
  1: { text: '待执行', tone: 'slate' },
  2: { text: '执行中', tone: 'amber' },
  3: { text: '成功', tone: 'green' },
  4: { text: '失败', tone: 'red' },
};

interface TaskFormValues {
  taskName: string;
  targetType: 1 | 2;
  keywordsText: string;
  schedule?: string;
}

function toParams(v: TaskFormValues): CreateSourceTaskParams {
  return {
    taskName: v.taskName.trim(),
    targetType: Number(v.targetType) as 1 | 2,
    keywords: v.keywordsText
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean),
    schedule: v.schedule?.trim() || undefined,
  };
}

function TasksTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [editing, setEditing] = useState<SourceTaskItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [delTarget, setDelTarget] = useState<SourceTaskItem | null>(null);

  const list = useQuery({
    queryKey: ['admin-source-tasks', page],
    queryFn: () => contentSourceApi.listSourceTasks({ page, pageSize }),
  });
  const rows = list.data?.list ?? [];
  const total = list.data?.total ?? 0;

  const { register, handleSubmit, reset } = useForm<TaskFormValues>();

  const openCreate = () => {
    setEditing(null);
    reset({ taskName: '', targetType: 1, keywordsText: '', schedule: '' });
    setShowForm(true);
  };
  const openEdit = (item: SourceTaskItem) => {
    setEditing(item);
    reset({
      taskName: item.taskName,
      targetType: item.targetType,
      keywordsText: (item.keywords ?? []).join(', '),
      schedule: item.schedule ?? '',
    });
    setShowForm(true);
  };

  const saveMut = useMutation({
    mutationFn: (v: TaskFormValues) =>
      editing
        ? contentSourceApi.updateSourceTask(editing.id, toParams(v))
        : contentSourceApi.createSourceTask(toParams(v)),
    onSuccess: () => {
      toast(editing ? '已保存' : '已新增');
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['admin-source-tasks'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const runMut = useMutation({
    mutationFn: (item: SourceTaskItem) => contentSourceApi.runSourceTask(item.id),
    onSuccess: (res) => {
      if (res.status === 3) {
        toast(`执行成功：新增 ${res.inserted ?? 0} / 跳过 ${res.skipped ?? 0}`);
      } else {
        toast(res.errorMsg || '执行失败', 'error');
      }
      qc.invalidateQueries({ queryKey: ['admin-source-tasks'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const delMut = useMutation({
    mutationFn: (item: SourceTaskItem) => contentSourceApi.deleteSourceTask(item.id),
    onSuccess: () => {
      toast('已删除');
      setDelTarget(null);
      qc.invalidateQueries({ queryKey: ['admin-source-tasks'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  return (
    <Card padding="none">
      <div className="flex items-center border-b border-slate-100 p-4">
        <p className="text-sm text-slate-500">AI 检索任务：定时/手动抓取岗位或学习资源入库。</p>
        <div className="ml-auto">
          <PermGate need="content:manage">
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
            >
              新增任务
            </button>
          </PermGate>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3">任务名</th>
              <th className="px-4 py-3">目标</th>
              <th className="px-4 py-3">关键词</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">最近结果</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  加载中…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
               <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  暂无数据
                </td>
              </tr>
            ) : (
              rows.map((item) => {
                const st = TASK_STATUS_TEXT[item.status] ?? TASK_STATUS_TEXT[1];
                return (
                  <tr key={item.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-slate-800">{item.taskName}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.targetType === 1 ? '岗位' : '资源'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {(item.keywords ?? []).join('、') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge text={st.text} tone={st.tone} />
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {item.lastResultCount != null ? `${item.lastResultCount} 条` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <PermGate need="content:manage">
                          <button
                            type="button"
                            onClick={() => runMut.mutate(item)}
                            disabled={item.status === 2 || runMut.isPending}
                            className="text-orange-600 hover:text-orange-700 disabled:opacity-40"
                          >
                            执行
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="text-slate-500 hover:text-orange-600"
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => setDelTarget(item)}
                            className="text-red-500 hover:text-red-700"
                          >
                            删除
                          </button>
                        </PermGate>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">
              {editing ? '编辑任务' : '新增任务'}
            </h3>
            <form
              onSubmit={handleSubmit((v) => saveMut.mutate(v))}
              className="mt-4 flex flex-col gap-3 text-sm"
            >
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">任务名 *</span>
                <input
                  {...register('taskName', { required: true })}
                  className="rounded-lg border border-slate-200 px-3 py-2"
              />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">目标类型 *</span>
                <select
                  {...register('targetType', { required: true })}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                >
                  <option value={1}>岗位</option>
                  <option value={2}>资源</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">关键词（逗号分隔，1~20 个）*</span>
                <input
                  {...register('keywordsText', { required: true })}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">调度表达式（可选 cron）</span>
                <input
                  {...register('schedule')}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saveMut.isPending}
                  className="rounded-lg bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                  {saveMut.isPending ? '保存中…' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!delTarget}
        title="删除任务"
        loading={delMut.isPending}
        confirmText="确认删除"
        onCancel={() => setDelTarget(null)}
        onConfirm={() => delTarget && delMut.mutate(delTarget)}
      >
        确认删除任务「{delTarget?.taskName}」？
      </ConfirmDialog>
    </Card>
  );
}

// ==================== 话题 Tab ====================

const AUDIT_TEXT: Record<number, { text: string; tone: 'green' | 'slate' | 'amber' | 'red' }> = {
  0: { text: '待审核', tone: 'amber' },
  1: { text: '已通过', tone: 'green' },
  2: { text: '已驳回', tone: 'red' },
};

function TopicsTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<TopicItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [delTarget, setDelTarget] = useState<TopicItem | null>(null);

  const list = useQuery({
    queryKey: ['admin-topics', page, keyword],
    queryFn: () => adminContentApi.listTopics({ page, pageSize, keyword: keyword || undefined }),
  });
  const rows = list.data?.list ?? [];
  const total = list.data?.total ?? 0;

  const { register, handleSubmit, reset } = useForm<CreateTopicParams>();

  const openCreate = () => {
    setEditing(null);
    reset({ title: '', content: '', category: '', tags: '', isPinned: 0 });
    setShowForm(true);
  };
  const openEdit = (item: TopicItem) => {
    setEditing(item);
    reset({
      title: item.title,
      content: item.content,
      category: item.category ?? '',
      tags: item.tags ?? '',
      isPinned: item.isPinned,
    });
    setShowForm(true);
  };

  const saveMut = useMutation({
    mutationFn: (v: CreateTopicParams) =>
      editing
        ? adminContentApi.updateTopic(editing.id, v)
        : adminContentApi.createTopic(v),
    onSuccess: () => {
      toast(editing ? '已保存' : '已新增');
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['admin-topics'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const reviewMut = useMutation({
    mutationFn: (arg: { item: TopicItem; auditStatus: 1 | 2 }) =>
      adminContentApi.reviewTopic(arg.item.id, { auditStatus: arg.auditStatus }),
    onSuccess: () => {
      toast('已审核');
      qc.invalidateQueries({ queryKey: ['admin-topics'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  const delMut = useMutation({
    mutationFn: (item: TopicItem) => adminContentApi.deleteTopic(item.id),
    onSuccess: () => {
      toast('已删除');
      setDelTarget(null);
      qc.invalidateQueries({ queryKey: ['admin-topics'] });
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });

  return (
    <Card padding="none">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <input
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setPage(1);
          }}
          placeholder="搜索话题标题"
          className="w-56 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <div className="ml-auto">
          <PermGate need="topic:review">
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
            >
              新增话题
            </button>
          </PermGate>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3">标题</th>
              <th className="px-4 py-3">分类</th>
              <th className="px-4 py-3">审核</th>
              <th className="px-4 py-3">互动</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  加载中…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  暂无数据
                </td>
              </tr>
            ) : (
              rows.map((item) => {
                const au = AUDIT_TEXT[item.auditStatus] ?? AUDIT_TEXT[0];
                return (
                  <tr key={item.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-slate-800">{item.title}</td>
                    <td className="px-4 py-3 text-slate-600">{item.category ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge text={au.text} tone={au.tone} />
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {item.viewCount ?? 0} 浏览 / {item.likeCount ?? 0} 赞
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <PermGate need="topic:review">
                          {item.auditStatus !== 1 && (
                            <button
                              type="button"
                              onClick={() => reviewMut.mutate({ item, auditStatus: 1 })}
                              disabled={reviewMut.isPending}
                              className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                            >
                              通过
                            </button>
                          )}
                          {item.auditStatus !== 2 && (
                            <button
                              type="button"
                              onClick={() => reviewMut.mutate({ item, auditStatus: 2 })}
                              disabled={reviewMut.isPending}
                              className="text-amber-600 hover:text-amber-700 disabled:opacity-50"
                            >
                              驳回
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="text-slate-500 hover:text-orange-600"
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => setDelTarget(item)}
                            className="text-red-500 hover:text-red-700"
                          >
                            删除
                          </button>
                        </PermGate>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">
              {editing ? '编辑话题' : '新增话题'}
            </h3>
            <form
              onSubmit={handleSubmit((v) => saveMut.mutate(v))}
              className="mt-4 flex flex-col gap-3 text-sm"
            >
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">标题 *</span>
                <input
                  {...register('title', { required: true })}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">正文 *</span>
                <textarea
                  {...register('content', { required: true })}
                  rows={4}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-slate-500">分类</span>
                  <input
                    {...register('category')}
                    className="rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-slate-500">标签（逗号分隔）</span>
                  <input
                    {...register('tags')}
                    className="rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
              </div>
              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saveMut.isPending}
                  className="rounded-lg bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  {saveMut.isPending ? '保存中…' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!delTarget}
        title="删除话题"
        loading={delMut.isPending}
        confirmText="确认删除"
        onCancel={() => setDelTarget(null)}
        onConfirm={() => delTarget && delMut.mutate(delTarget)}
      >
        确认删除「{delTarget?.title}」？此操作不可恢复。
      </ConfirmDialog>
    </Card>
  );
}