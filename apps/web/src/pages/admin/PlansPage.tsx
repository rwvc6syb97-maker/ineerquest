/**
 * 运营后台 - 付费套餐管理页
 * -------------------------------------------------------------
 * 功能：列表/新增/编辑/上下架/删除会员套餐，直接控制 C 端定价页展示。
 */
import { useCallback, useEffect, useState } from 'react';
import { adminMembershipApi } from '../../api';
import type { AdminPlan, CreatePlanParams } from '../../api/modules/admin-membership.api';
import {
  StatusBadge,
  Pagination,
  ConfirmDialog,
  toast,
  Toaster,
  errMsg,
} from './_shared';

const PAGE_SIZE = 10;

/* 套餐类型映射 */
const PLAN_TYPE_MAP: Record<number, string> = {
  1: '单次购买',
  2: '周期订阅',
};

/* 空表单 */
function emptyForm(): CreatePlanParams {
  return {
    code: '',
    name: '',
    subtitle: '',
    price: 0,
    originalPrice: undefined,
    durationDays: undefined,
    planType: 1,
    benefits: [],
    sortOrder: 0,
    isRecommended: 0,
  };
}

export function PlansPage() {
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  /* 表单 */
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreatePlanParams>(emptyForm());
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  /* 删除确认 */
  const [delTarget, setDelTarget] = useState<AdminPlan | null>(null);

  /* 上下架确认 */
  const [toggleTarget, setToggleTarget] = useState<AdminPlan | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminMembershipApi.listPlans();
      setPlans(data);
    } catch (e) {
      toast(errMsg(e, '加载套餐列表失败'), 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const paged = plans.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* 新增 */
  const onNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormError('');
    setShowForm(true);
  };

  /* 编辑 */
  const onEdit = (p: AdminPlan) => {
    setEditingId(p.id);
    setForm({
      code: p.code,
      name: p.name,
      subtitle: p.subtitle ?? '',
      price: p.price,
      originalPrice: p.originalPrice ?? undefined,
      durationDays: p.durationDays ?? undefined,
      planType: p.planType,
      benefits: Array.isArray(p.benefits) ? [...p.benefits] : [],
      sortOrder: p.sortOrder,
      isRecommended: p.isRecommended,
    });
    setFormError('');
    setShowForm(true);
  };

  const onSave = async () => {
    setFormError('');
    if (!form.code.trim()) { setFormError('套餐编码不能为空'); return; }
    if (!form.name.trim()) { setFormError('套餐名称不能为空'); return; }
    if (form.price < 0) { setFormError('价格不能为负数'); return; }

    setSaving(true);
    try {
      if (editingId) {
        await adminMembershipApi.updatePlan(editingId, form);
        toast('套餐已更新');
      } else {
        await adminMembershipApi.createPlan(form);
        toast('套餐已创建');
      }
      setShowForm(false);
      fetchPlans();
    } catch (e) {
      setFormError(errMsg(e, '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  /* 删除 */
  const onDeleteConfirm = async () => {
    if (!delTarget) return;
    try {
      await adminMembershipApi.deletePlan(delTarget.id);
      toast('套餐已删除');
      setDelTarget(null);
      fetchPlans();
    } catch (e) {
      toast(errMsg(e, '删除失败'), 'error');
    }
  };

  /* 上下架 */
  const onToggleConfirm = async () => {
    if (!toggleTarget) return;
    const newStatus = toggleTarget.status === 1 ? 0 : 1;
    try {
      await adminMembershipApi.setPlanStatus(toggleTarget.id, newStatus);
      toast(newStatus === 1 ? '套餐已上架' : '套餐已下架');
      setToggleTarget(null);
      fetchPlans();
    } catch (e) {
      toast(errMsg(e, '操作失败'), 'error');
    }
  };

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">付费套餐管理</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            管理 C 端定价页展示的套餐方案，支持创建、编辑、上下架与删除
          </p>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 新建套餐
        </button>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm text-left">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">套餐名称</th>
              <th className="px-4 py-3 font-medium">编码</th>
              <th className="px-4 py-3 font-medium">价格</th>
              <th className="px-4 py-3 font-medium">类型</th>
              <th className="px-4 py-3 font-medium">有效期</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  加载中…
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  暂无套餐，点击"新建套餐"添加
                </td>
              </tr>
            ) : (
              paged.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {p.name}
                      {p.isRecommended === 1 ? (
                        <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                          推荐
                        </span>
                      ) : null}
                    </div>
                    {p.subtitle ? (
                      <div className="mt-0.5 text-xs text-slate-400">{p.subtitle}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.code}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-900">
                      ¥{(p.price / 100).toFixed(0)}
                    </span>
                    {p.originalPrice ? (
                      <span className="ml-1.5 text-xs text-slate-400 line-through">
                        ¥{(p.originalPrice / 100).toFixed(0)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {PLAN_TYPE_MAP[p.planType] || '未知'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.durationDays ? `${p.durationDays} 天` : '永久'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      text={p.status === 1 ? '已上架' : '已下架'}
                      tone={p.status === 1 ? 'green' : 'slate'}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(p)}
                        className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => setToggleTarget(p)}
                        className={`rounded px-2 py-1 text-xs transition-colors ${
                          p.status === 1
                            ? 'text-amber-600 hover:bg-amber-50'
                            : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        {p.status === 1 ? '下架' : '上架'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDelTarget(p)}
                        className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 transition-colors"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={plans.length}
        onChange={setPage}
      />

      {/* 表单弹窗 */}
      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-12">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">
              {editingId ? '编辑套餐' : '新建套餐'}
            </h3>

            <div className="mt-4 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-0.5 block text-xs text-slate-500">编码 *</label>
                  <input
                    type="text"
                    value={form.code}
                    disabled={!!editingId}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="如 pro-monthly"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-xs text-slate-500">名称 *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="如 Pro 月度"
                  />
                </div>
              </div>

              <div>
                <label className="mb-0.5 block text-xs text-slate-500">副标题</label>
                <input
                  type="text"
                  value={form.subtitle ?? ''}
                  onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="一句话卖点描述"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-0.5 block text-xs text-slate-500">价格 (元) *</label>
                  <input
                    type="number"
                    value={(form.price / 100).toFixed(0)}
                    onChange={(e) => setForm({ ...form, price: Math.max(0, Number(e.target.value)) * 100 })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    min="0"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-xs text-slate-500">原价 (元)</label>
                  <input
                    type="number"
                    value={form.originalPrice != null ? (form.originalPrice / 100).toFixed(0) : ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm({ ...form, originalPrice: v === '' ? undefined : Math.max(0, Number(v)) * 100 });
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    min="0"
                    placeholder="无"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-xs text-slate-500">有效期 (天)</label>
                  <input
                    type="number"
                    value={form.durationDays ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm({ ...form, durationDays: v === '' ? undefined : Math.max(0, Number(v)) });
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    min="0"
                    placeholder="永久"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-0.5 block text-xs text-slate-500">套餐类型</label>
                  <select
                    value={form.planType ?? 1}
                    onChange={(e) => setForm({ ...form, planType: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value={1}>单次购买</option>
                    <option value={2}>周期订阅</option>
                  </select>
                </div>
                <div>
                  <label className="mb-0.5 block text-xs text-slate-500">排序值</label>
                  <input
                    type="number"
                    value={form.sortOrder ?? 0}
                    onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-xs text-slate-500">是否推荐</label>
                  <select
                    value={form.isRecommended ?? 0}
                    onChange={(e) => setForm({ ...form, isRecommended: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value={0}>否</option>
                    <option value={1}>是</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-0.5 block text-xs text-slate-500">
                  权益点（每行一条）
                </label>
                <textarea
                  value={Array.isArray(form.benefits) ? form.benefits.join('\n') : ''}
                  onChange={(e) => setForm({ ...form, benefits: e.target.value.split('\n').filter((s) => s.trim()) })}
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="每行写一条权益，如：&#10;AI 深度职业分析&#10;专属成长报告"
                />
              </div>

              {formError ? (
                <p className="text-sm text-red-500" role="alert">{formError}</p>
              ) : null}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={onSave}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '保存中…' : editingId ? '保存修改' : '创建套餐'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!delTarget}
        title="确认删除"
        confirmText="确认删除"
        loading={false}
        onConfirm={onDeleteConfirm}
        onCancel={() => setDelTarget(null)}
      >
        {delTarget ? (
          <p>
            确定要删除套餐 <span className="font-semibold">{delTarget.name}</span> 吗？此操作不可逆，已购买该套餐的用户不受影响。
          </p>
        ) : null}
      </ConfirmDialog>

      {/* 上下架确认 */}
      <ConfirmDialog
        open={!!toggleTarget}
        title={toggleTarget?.status === 1 ? '确认下架' : '确认上架'}
        confirmText={toggleTarget?.status === 1 ? '确认下架' : '确认上架'}
        danger={toggleTarget?.status === 1}
        loading={false}
        onConfirm={onToggleConfirm}
        onCancel={() => setToggleTarget(null)}
      >
        {toggleTarget ? (
          <p>
            确定要将套餐 <span className="font-semibold">{toggleTarget.name}</span>
            {toggleTarget.status === 1 ? '下架' : '上架'}吗？
            {toggleTarget.status === 1 ? '下架后 C 端将不再展示该套餐。' : ''}
          </p>
        ) : null}
      </ConfirmDialog>

      <Toaster />
    </div>
  );
}
