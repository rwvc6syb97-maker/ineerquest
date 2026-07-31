/**
 * M4 简历上传优化页 /app/resume
 * -------------------------------------------------------------
 * 流程：上传 PDF（拖拽/选择）→ 选择目标岗位 → 提交优化 → 对照展示结构化建议。
 *
 * 严格约束：
 *  - 类型来源：api/modules/ai-resume.api.ts（对齐后端 ai-resume.dto.ts 冻结契约）。
 *  - 业务校验交后端；前端仅做 PDF 类型 + 10MB 大小前置校验减少往返，报错以后端 message 为准。
 *  - data 字段全部可选判空（suggestions/items/missingKeywords），禁止白屏。
 *  - 接口失败明确报错，绝不静默回退 mock。
 *  - 设计规范：暖橙 CTA(accent)、Reveal 一次性入场、骨架屏、可 Tab 聚焦。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, UploadCloud, X, AlertTriangle, Sparkles } from '../../components/icons';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Reveal, RevealItem } from '../../components/ui/Reveal';
import { SpringButton } from '../../components/system/SpringButton';
import { searchCareers, type CareerCard } from '../../api/modules/career.api';
import {
  optimizeResume,
  RESUME_OPTIMIZE_CODE,
  type ResumeOptimizeResult,
} from '../../api/modules/ai-resume.api';
import { ApiError } from '../../api/client';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/** 兜底错误文案：仅当后端未返回 message 时按错误码兜底（业务文案优先用后端 message） */
const CODE_FALLBACK: Record<number, string> = {
  [RESUME_OPTIMIZE_CODE.NO_FILE]: '请先选择要优化的简历文件',
  [RESUME_OPTIMIZE_CODE.NOT_PDF]: '仅支持 PDF 格式的简历',
  [RESUME_OPTIMIZE_CODE.TOO_LARGE]: '文件超过 10MB，请压缩后重试',
  [RESUME_OPTIMIZE_CODE.EXTRACT_FAILED]: '无法读取简历内容，请确认非加密件/扫描件且内容非空',
  [RESUME_OPTIMIZE_CODE.CAREER_MISSING]: '请选择有效的目标岗位',
  [RESUME_OPTIMIZE_CODE.TEXT_TOO_LONG]: '简历内容过长，请精简后重试',
  [RESUME_OPTIMIZE_CODE.SENSITIVE]: '简历包含敏感内容，无法处理',
  [RESUME_OPTIMIZE_CODE.DUPLICATE]: '该简历已提交过优化，请勿重复提交',
  [RESUME_OPTIMIZE_CODE.QUOTA_EXCEEDED]: '今日优化次数已用完，请明天再来',
  [RESUME_OPTIMIZE_CODE.UNAUTHORIZED]: '登录已失效，请重新登录',
};

function resolveErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    // 业务文案优先用后端 message；缺失时用错误码兜底
    return err.message || CODE_FALLBACK[err.code] || '优化失败，请稍后重试';
  }
  return '网络异常，请检查连接后重试';
}

export function ResumeOptimizePage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [careerId, setCareerId] = useState('');
  const [note, setNote] = useState('');
  const [careers, setCareers] = useState<CareerCard[]>([]);
  const [careersLoading, setCareersLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ResumeOptimizeResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 目标岗位选择器数据源：复用 careers 搜索（空关键词取默认列表）
  useEffect(() => {
    let alive = true;
    setCareersLoading(true);
    searchCareers('')
      .then((list) => {
        if (alive) setCareers(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        // 岗位列表失败不阻塞页面，但不静默 mock：置空并允许用户重试提交时报错
        if (alive) setCareers([]);
      })
      .finally(() => {
        if (alive) setCareersLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const canSubmit = useMemo(
    () => !!file && !!careerId && !submitting,
    [file, careerId, submitting],
  );

  /** 前端前置校验（类型/大小），业务校验仍以后端为准 */
  function pickFile(f: File | null) {
    setError('');
    if (!f) return;
    const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setError('仅支持 PDF 格式的简历');
      return;
    }
    if (f.size > MAX_SIZE) {
      setError('文件超过 10MB，请压缩后重试');
      return;
    }
    setFile(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files?.[0] ?? null);
  }

  async function handleSubmit() {
    if (!file || !careerId) return;
    setSubmitting(true);
    setError('');
    setResult(null);
    try {
      const res = await optimizeResume({ file, targetCareerId: careerId, note: note.trim() || undefined });
      setResult(res);
    } catch (err) {
      setError(resolveErrorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setFile(null);
    setResult(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  const suggestions = result?.suggestions;
  const items = suggestions?.items ?? [];
  const missingKeywords = suggestions?.missingKeywords ?? [];

  return (
    <ResumeOptimizeView
      state={{
        file,
        dragging,
        careerId,
        note,
        careers,
        careersLoading,
        submitting,
        error,
        result,
        suggestions,
        items,
        missingKeywords,
        canSubmit,
        inputRef,
      }}
      actions={{
        setDragging,
        setCareerId,
        setNote,
        pickFile,
        onDrop,
        handleSubmit,
        reset,
      }}
    />
  );
}

/** 视图 props 类型（拆分逻辑/视图，保持组件可读） */
interface ViewProps {
  state: {
    file: File | null;
    dragging: boolean;
    careerId: string;
    note: string;
    careers: CareerCard[];
    careersLoading: boolean;
    submitting: boolean;
    error: string;
    result: ResumeOptimizeResult | null;
    suggestions: ResumeOptimizeResult['suggestions'] | undefined;
    items: ResumeOptimizeResult['suggestions']['items'];
    missingKeywords: string[];
    canSubmit: boolean;
    inputRef: React.RefObject<HTMLInputElement>;
  };
  actions: {
    setDragging: (v: boolean) => void;
    setCareerId: (v: string) => void;
    setNote: (v: string) => void;
    pickFile: (f: File | null) => void;
    onDrop: (e: React.DragEvent) => void;
    handleSubmit: () => void;
    reset: () => void;
  };
}

function ResumeOptimizeView({ state, actions }: ViewProps) {
  const {
    file, dragging, careerId, note, careers, careersLoading,
    submitting, error, result, suggestions, items, missingKeywords, canSubmit, inputRef,
  } = state;
  const { setDragging, setCareerId, setNote, pickFile, onDrop, handleSubmit, reset } = actions;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <Reveal>
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-brand-primary-950 sm:text-3xl">
            AI 简历优化
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-neutral-500">
            上传 PDF 简历并选择目标岗位，AI 将逐段给出优化建议、匹配度评分与缺失关键词。
          </p>
        </div>
      </Reveal>

      {/* 表单区 */}
      <Card padding="lg" className="mb-6">
        {/* 上传区 */}
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragging ? 'border-[#f97316] bg-orange-50/50' : 'border-neutral-300 hover:border-brand-primary-400'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="sr-only"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div className="flex items-center gap-3 rounded-xl bg-neutral-50 px-4 py-3">
              <FileText className="h-6 w-6 text-brand-primary-500" aria-hidden />
              <span className="max-w-[220px] truncate text-sm font-medium text-brand-primary-950">
             {file.name}
              </span>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); reset(); }}
                className="rounded-full p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 focus-visible:ring-2"
                aria-label="移除文件"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <UploadCloud className="h-10 w-10 text-brand-primary-400" aria-hidden />
              <div className="text-sm font-medium text-brand-primary-950">
                点击选择或拖拽 PDF 简历到此处
              </div>
              <div className="text-xs text-neutral-400">仅支持 PDF，单个文件不超过 10MB</div>
            </>
          )}
        </label>

        {/* 目标岗位选择器 */}
        <div className="mt-6">
          <label htmlFor="targetCareer" className="mb-2 block text-sm font-medium text-brand-primary-950">
            目标岗位 <span className="text-[#f97316]">*</span>
          </label>
          <select
            id="targetCareer"
            value={careerId}
            onChange={(e) => setCareerId(e.target.value)}
            disabled={careersLoading}
            className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm text-brand-primary-950 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-400 disabled:opacity-60"
          >
            <option value="">
              {careersLoading ? '岗位加载中…' : '请选择目标岗位'}
            </option>
            {careers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
                {c.category ? `（${c.category}）` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* 补充说明 */}
        <div className="mt-4">
          <label htmlFor="note" className="mb-2 block text-sm font-medium text-brand-primary-950">
            补充说明（可选）
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            rows={3}
            maxLength={500}
            placeholder="如：希望突出项目经验、期望城市等"
            className="w-full resize-none rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm text-brand-primary-950 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary-400"
          />
          <div className="mt-1 text-right text-xs text-neutral-400">{note.length}/500</div>
        </div>

        {/* 错误提示 */}
        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}

        {/* 提交按钮（暖橙 CTA） */}
        <div className="mt-6 flex justify-end">
          <SpringButton
            variant="accent"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={!canSubmit ? 'opacity-50' : ''}
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            {submitting ? 'AI 优化中…' : '开始优化'}
          </SpringButton>
        </div>
      </Card>

      {/* 结果区 */}
      {submitting ? <ResultSkeleton /> : null}

      {!submitting && result && suggestions ? (
        <Reveal deps={[result.docId]}>
          <div className="space-y-5">
            {/* 概览：匹配度 + 整体评价 + 降级提示 */}
            <Card padding="lg">
              {result.degraded ? (
                <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>AI 服务繁忙，本次为兜底建议，结果可能不够精准，建议稍后重新优化。</span>
                </div>
              ) : null}
              <div className="flex items-center gap-6">
                <div className="flex flex-col items-center">
                  <div className="font-display text-4xl font-bold text-[#f97316]">
                    {suggestions.matchScore ?? 0}
                  </div>
                  <div className="mt-1 text-xs text-neutral-400">匹配度</div>
                </div>
                <div className="flex-1 text-sm leading-relaxed text-neutral-600">
                  {suggestions.overallComment || '暂无整体评价'}
                </div>
              </div>
              {suggestions.targetCareer?.name ? (
                <div className="mt-4 text-xs text-neutral-400">
                  目标岗位：{suggestions.targetCareer.name}
                  {suggestions.targetCareer.category ? `（${suggestions.targetCareer.category}）` : ''}
                </div>
              ) : null}
            </Card>

            {/* 缺失关键词 */}
            {missingKeywords.length > 0 ? (
              <Card padding="lg">
                <h2 className="mb-3 font-display text-base font-semibold text-brand-primary-950">
                  建议补充的关键词
                </h2>
                <div className="flex flex-wrap gap-2">
                  {missingKeywords.map((kw, i) => (
                    <span key={`${kw}-${i}`} className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-[#f97316]">
                      {kw}
                    </span>
                  ))}
                </div>
              </Card>
            ) : null}

            {/* 逐段对照建议 */}
            {items.length > 0 ? (
              <Reveal as="div" className="space-y-4">
                {items.map((it, i) => (
                  <RevealItem key={`${it.section}-${i}`} index={i}>
                    <Card padding="lg">
                      <div className="mb-3 text-sm font-semibold text-brand-primary-950">
                        {it.section || `段落 ${i + 1}`}
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-xl bg-neutral-50 p-4">
                          <div className="mb-1.5 text-xs font-medium text-neutral-400">原文</div>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-500">
                            {it.original || '—'}
                          </p>
                        </div>
                        <div className="rounded-xl bg-orange-50/60 p-4">
                          <div className="mb-1.5 text-xs font-medium text-[#f97316]">优化建议</div>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-brand-primary-950">
                            {it.suggestion || '—'}
                          </p>
                        </div>
                      </div>
                      {it.reason ? (
                        <p className="mt-3 text-xs leading-relaxed text-neutral-400">
                          优化理由：{it.reason}
                        </p>
                      ) : null}
                    </Card>
                  </RevealItem>
                ))}
              </Reveal>
            ) : (
              <EmptyState
                icon="sparkle"
                title="暂无逐段建议"
                description="本次未生成分段优化项，可尝试补充说明后重新优化。"
              />
            )}
          </div>
        </Reveal>
      ) : null}
    </div>
  );
}

/** 结果加载骨架屏 */
function ResultSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <Card padding="lg">
        <div className="flex items-center gap-6">
          <div className="h-14 w-14 animate-pulse rounded-full bg-neutral-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-3/4 animate-pulse rounded bg-neutral-100" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-neutral-100" />
          </div>
        </div>
      </Card>
      {[0, 1].map((i) => (
        <Card key={i} padding="lg">
          <div className="mb-3 h-3 w-24 animate-pulse rounded bg-neutral-100" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-20 animate-pulse rounded-xl bg-neutral-100" />
            <div className="h-20 animate-pulse rounded-xl bg-neutral-100" />
          </div>
        </Card>
      ))}
    </div>
  );
}