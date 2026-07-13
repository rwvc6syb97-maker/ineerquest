/**
 * 运营后台 - AI 职业草稿（P3-4 / §4.4）
 * -------------------------------------------------------------
 * - 直接消费 useCareerAi（走 admin token），严禁 mock 兜底。
 * - 生成草稿：name/category/refSources（招聘源被后端 4005 拒，前端不做业务判断）。
 * - 草稿列表：status 过滤 + 分页；审核 approve/reject（人工审核不可前端绕过）。
 * - 错误码分流：4030 越权 / 4461 重复名 / 4460 草稿不存在 / 4462 已审核。
 * - career/skills 为 Record<string,unknown>，宽松渲染，全字段判空。
 */
import { useEffect, useState } from 'react';
import { useCareerAi } from '../../hooks/useAiPlus';
import type {
  DraftStatus,
  ReviewAction,
} from '../../api/modules/ai-plus.api';
import { Card } from '../../components/ui/Card';
import {
  StatusBadge,
  Pagination,
  PermGate,
  useToast,
} from './_shared';

const PAGE_SIZE = 10;

const STATUS_TEXT: Record<number, { text: string; tone: 'green' | 'slate' | 'amber' }> = {
  0: { text: '待审核', tone: 'amber' },
  1: { text: '已通过', tone: 'green' },
  2: { text: '已拒绝', tone: 'slate' },
};

const STATUS_FILTERS: { key: DraftStatus | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 0, label: '待审核' },
  { key: 1, label: '已通过' },
  { key: 2, label: '已拒绝' },
];

export function CareerDraftsPage() {
  const notify = useToast();
  const {
    generateData,
    draftList,
    loading,
    error,
    forbidden,
    dupName,
    draftNotFound,
    alreadyReviewed,
    generate,
    fetchDrafts,
    review,
    reset,
  } = useCareerAi();

  // 生成表单
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [refText, setRefText] = useState('');

  // 列表过滤 / 分页
  const [statusFilter, setStatusFilter] = useState<DraftStatus | 'all'>('all');
  const [page, setPage] = useState(1);

  // 审核态
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewRemark, setReviewRemark] = useState('');

  const loadDrafts = (p = page) => {
    void fetchDrafts({
      status: statusFilter === 'all' ? undefined : statusFilter,
      page: p,
      pageSize: PAGE_SIZE,
    });
  };

  useEffect(() => {
    setPage(1);
    void fetchDrafts({
      status: statusFilter === 'all' ? undefined : statusFilter,
      page: 1,
      pageSize: PAGE_SIZE,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // 错误码提示（业务文案优先后端 message）
  useEffect(() => {
    if (!error) return;
    notify(error, 'error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const handleGenerate = async () => {
    if (!name.trim() || !category.trim()) {
      notify('请填写职业名与品类', 'error');
      return;
    }
    const refSources = refText
      .split(/[\n,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await generate({
      name: name.trim(),
      category: category.trim(),
      refSources: refSources.length ? refSources : undefined,
    });
    if (res) {
      notify('草稿已生成，待人工审核', 'success');
      setName('');
      setCategory('');
      setRefText('');
      loadDrafts(1);
      setPage(1);
    }
  };

  const handleReview = async (draftId: string, action: ReviewAction) => {
    const res = await review(draftId, {
      action,
      remark: reviewRemark.trim() || undefined,
    });
    if (res) {
      notify(action === 'approve' ? '已通过并同步职业库' : '已拒绝', 'success');
      setReviewingId(null);
      setReviewRemark('');
      loadDrafts();
    }
  };

  const list = draftList?.list ?? [];
  const total = draftList?.total ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-slate-900">AI 职业草稿</h1>

      {forbidden && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          当前管理员无该操作权限，请联系超级管理员开通。
        </div>
      )}

      {/* 生成草稿 */}
      <PermGate need="career:write">
        <Card className="p-5">
          <h2 className="text-base font-semibold text-slate-900">AI 生成职业草稿</h2>
          <p className="mt-1 text-xs text-slate-500">
            生成后进入待审核，需人工审核通过方可同步至正式职业库。参考来源请使用权威机构，招聘平台将被拒绝。
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-slate-600">
              职业名
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder="如：数据分析师"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-600">
              品类
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                maxLength={40}
                placeholder="如：互联网 / 金融"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="mt-3 flex flex-col gap-1 text-sm text-slate-600">
            参考来源（可选，多个用换行或逗号分隔）
            <textarea
              value={refText}
              onChange={(e) => setRefText(e.target.value)}
              rows={2}
              placeholder="如：国家职业分类大典、行业协会白皮书"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          {dupName && (
            <p className="mt-2 text-xs text-red-600">该职业名已存在草稿或正式库，请更换名称。</p>
          )}
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={handleGenerate}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? '生成中…' : '生成草稿'}
            </button>
            {generateData?.draftId && (
              <span className="text-xs text-slate-500">
                最近生成草稿 ID：{generateData.draftId}
              </span>
            )}
          </div>
        </Card>
      </PermGate>

      {/* 状态过滤 */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={String(f.key)}
            type="button"
            onClick={() => setStatusFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-sm ${
              statusFilter === f.key
                ? 'border-blue-600 bg-blue-50 text-blue-600'
                : 'border-slate-300 text-slate-500 hover:text-slate-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 草稿列表 */}
      <Card className="p-0">
        {loading && list.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">加载中…</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            {error ? '加载失败，请重试' : '暂无草稿'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {list.map((d) => {
              const st = STATUS_TEXT[d.status] ?? { text: '未知', tone: 'slate' as const };
              const isReviewing = reviewingId === d.draftId;
              return (
                <div key={d.draftId} className="flex flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{d.name || '—'}</span>
                      <span className="text-xs text-slate-400">{d.category || '—'}</span>
                      <StatusBadge tone={st.tone} text={st.text} />
                    </div>
                    <span className="text-xs text-slate-400">
                      {d.createdAt ? new Date(d.createdAt).toLocaleString() : ''}
                    </span>
                  </div>
                  {d.reviewRemark && (
                    <p className="text-xs text-slate-500">审核备注：{d.reviewRemark}</p>
                  )}
                  {d.syncedCareerId && (
                    <p className="text-xs text-green-600">已同步职业 ID：{d.syncedCareerId}</p>
                  )}

                  {/* 待审核才可操作 */}
                  {d.status === 0 && (
                    <PermGate need="career:write">
                      {!isReviewing ? (
                        <div>
                          <button
                            type="button"
                            onClick={() => {
                              setReviewingId(d.draftId);
                              setReviewRemark('');
                            }}
                            className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
                          >
                            审核
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <textarea
                            value={reviewRemark}
                            onChange={(e) => setReviewRemark(e.target.value)}
                            rows={2}
                            placeholder="审核备注（可选）"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          />
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() => handleReview(d.draftId, 'approve')}
                              className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              通过
                            </button>
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() => handleReview(d.draftId, 'reject')}
                              className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              拒绝
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setReviewingId(null);
                                setReviewRemark('');
                              }}
                              className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-white"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      )}
                    </PermGate>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {total > PAGE_SIZE && (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onChange={(p) => {
              setPage(p);
              loadDrafts(p);
            }}
          />
        )}
      </Card>

      {(draftNotFound || alreadyReviewed) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {draftNotFound
            ? '该草稿不存在或已被移除，列表已过期，请刷新。'
            : '该草稿已被审核，无需重复操作。'}
          <button
            type="button"
            onClick={() => {
              reset();
              loadDrafts();
            }}
            className="ml-2 underline"
          >
            刷新列表
          </button>
        </div>
      )}
    </div>
  );
}