/**
 * P2-1 团队/关系协作分析页（/collab，游客可用）
 * -------------------------------------------------------------
 * 动态增删成员 2~6 人（name 可选 + mbtiType 必填），提交后展示 summary/pairs/risks。
 * 数据 hook：useCollabAnalyze（loading/error/errorCode/quotaLimited/degraded/run/reset）。
 * 配额限制（9001/9002）走 quotaLimited 引导型 amber 提示，非报错弹窗；degraded=true 仍完整展示。
 * 前端仅做基础校验（成员 2~6 人、mbtiType 非空），业务校验全交后端；报错文案优先用后端 message。
 */
import { useState } from 'react';
import { useCollabAnalyze } from '../../hooks/useAiPlus';
import type { CollabMember } from '../../api/modules/ai-plus.api';
import {
  Card,
  SectionHeading,
  StatPill,
  Tag,
  Reveal,
  RevealItem,
  EmptyState,
  SpringButton,
} from '../../components';
import { COLORS } from '../../theme/tokens';

/** 16 型 MBTI，供成员下拉选择。 */
const MBTI_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
] as const;

/** 表单成员行（含空位默认值）。 */
type MemberRow = { name: string; mbtiType: string };

const MIN_MEMBERS = 2;
const MAX_MEMBERS = 6;

function initialRows(): MemberRow[] {
  return [
    { name: '', mbtiType: '' },
    { name: '', mbtiType: '' },
  ];
}

export function CollabAnalyzePage() {
  const [rows, setRows] = useState<MemberRow[]>(initialRows);
  const [scene, setScene] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const { data, loading, error, quotaLimited, degraded, run, reset } = useCollabAnalyze();

  const updateRow = (idx: number, patch: Partial<MemberRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setRows((prev) => (prev.length < MAX_MEMBERS ? [...prev, { name: '', mbtiType: '' }] : prev));
  };

  const removeRow = (idx: number) => {
    setRows((prev) => (prev.length > MIN_MEMBERS ? prev.filter((_, i) => i !== idx) : prev));
  };

  const handleSubmit = async () => {
    setLocalError(null);
    // 前端基础校验：每位成员 mbtiType 非空（业务校验以后端为准）
    const filled = rows.filter((r) => r.mbtiType.trim());
    if (filled.length < MIN_MEMBERS) {
      setLocalError('请至少填写 2 位成员的 MBTI 类型');
      return;
    }
    const members: CollabMember[] = filled.map((r) => ({
      ...(r.name.trim() ? { name: r.name.trim() } : {}),
      mbtiType: r.mbtiType.trim(),
    }));
    await run({ members, ...(scene.trim() ? { scene: scene.trim() } : {}) });
  };

  const handleReset = () => {
    reset();
    setRows(initialRows());
    setScene('');
    setLocalError(null);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <SectionHeading
        eyebrow="COLLABORATION"
        title="团队协作分析"
        subtitle="输入 2~6 位成员的 MBTI 类型，AI 为你解读团队协同度、两两配对建议与潜在风险。"
      />

      {/* ===== 输入区 ===== */}
      <Card padding="lg" className="mt-6">
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div key={idx} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                value={row.name}
                onChange={(e) => updateRow(idx, { name: e.target.value })}
                placeholder={`成员 ${idx + 1} 昵称（可选）`}
                maxLength={20}
                className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-brand-primary-500"
              />
              <select
                value={row.mbtiType}
                onChange={(e) => updateRow(idx, { mbtiType: e.target.value })}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-brand-primary-500 sm:w-40"
              >
                <option value="">选择 MBTI 类型</option>
                {MBTI_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeRow(idx)}
                disabled={rows.length <= MIN_MEMBERS}
                className="shrink-0 rounded-lg px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="移除成员"
              >
                移除
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= MAX_MEMBERS}
          className="mt-3 rounded-lg border border-dashed border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:border-brand-primary-500 hover:text-brand-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + 添加成员（最多 {MAX_MEMBERS} 人）
        </button>

        <div className="mt-4">
          <input
            type="text"
            value={scene}
      onChange={(e) => setScene(e.target.value)}
            placeholder="协作场景（可选，如“新产品项目组”）"
            maxLength={50}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-brand-primary-500"
          />
        </div>

        {localError ? (
          <p className="mt-3 text-sm text-red-500">{localError}</p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <SpringButton variant="accent" onClick={handleSubmit} disabled={loading}>
            {loading ? '分析中…' : '开始分析'}
          </SpringButton>
          {data ? (
            <SpringButton variant="ghost" onClick={handleReset}>
              重新分析
            </SpringButton>
          ) : null}
        </div>
      </Card>

      {/* ===== 配额限制（9001/9002）引导型提示，非报错弹窗 ===== */}
      {quotaLimited ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">{error ?? '协作分析次数已达上限'}</p>
          <p className="mt-1 text-xs text-amber-600">
            登录后可获得更多分析次数，或稍后再试。
          </p>
        </div>
      ) : null}

      {/* ===== 普通错误提示（非配额） ===== */}
      {error && !quotaLimited ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : null}

      {/* ===== 结果区 ===== */}
      {data ? (
        <div className="mt-8 space-y-8">
          {degraded ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
              <p className="text-xs text-amber-700">
                当前为快速兜底结果，稍后可重试获取更完整的分析。
              </p>
            </div>
          ) : null}

          {/* 团队总览 */}
          <section>
            <SectionHeading as="h2" size="md" eyebrow="Overview" title="团队总览" />
            <Card padding="lg" className="mt-4">
              <p className="leading-relaxed text-neutral-700">
                {data.summary || '暂无总览内容。'}
              </p>
            </Card>
          </section>

          {/* 两两配对 */}
          {data.pairs.length ? (
            <section>
              <SectionHeading as="h2" size="md" eyebrow="Pairs" title="两两配对分析" />
              <Reveal className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" deps={[data.summary]}>
                {data.pairs.map((p, i) => (
                  <RevealItem key={`${p.a}-${p.b}-${i}`} index={i}>
                    <Card padding="md" className="flex h-full flex-col">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-brand-primary-950">
                          {p.a} × {p.b}
                        </span>
                        <StatPill tone="accent" label="协同度" value={p.synergy} suffix="%" />
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-neutral-600">{p.advice}</p>
                    </Card>
                  </RevealItem>
                ))}
              </Reveal>
            </section>
          ) : null}

          {/* 风险提示 */}
          {data.risks.length ? (
            <section>
              <SectionHeading as="h2" size="md" eyebrow="Risks" title="潜在风险" />
              <Reveal className="mt-4 space-y-2.5" deps={[data.summary]}>
                {data.risks.map((r, i) => (
                  <RevealItem
                    key={r}
                    index={i}
                    className="flex items-start gap-3 rounded-xl border border-neutral-200/70 bg-white px-4 py-3"
                  >
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: COLORS.accent }}
                    />
                    <span className="text-sm leading-relaxed text-neutral-700">{r}</span>
                  </RevealItem>
                ))}
              </Reveal>
            </section>
          ) : null}
        </div>
      ) : !loading && !error ? (
        <div className="mt-8">
          <EmptyState
            icon="sparkle"
            title="填写成员信息，开启协作分析"
            description="输入 2~6 位成员的 MBTI 类型，即可查看团队协同解读。"
          />
        </div>
      ) : null}

      {/* 标签装饰（说明性） */}
      <div className="mt-8 flex flex-wrap gap-2">
        <Tag tone="neutral" size="sm">2~6 人</Tag>
        <Tag tone="neutral" size="sm">游客可体验</Tag>
        <Tag tone="brand" size="sm">AI 协同解读</Tag>
      </div>
    </div>
  );
}

export default CollabAnalyzePage;