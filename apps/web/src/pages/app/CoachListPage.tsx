/**
 * P19 辅导师列表（/app/coaching/coaches）
 * -------------------------------------------------------------
 * 浏览与筛选辅导师：领域 Chip 筛选 + 关键词搜索 + 评分/价格展示。
 * 卡片点击进入 P20 详情。数据 hook useCoaches（失败呈现错误态并支持重试）。
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCoaches } from '../../hooks/useCoaching';
import { useCoachingMatch } from '../../hooks/useAiPlus';
import { MATCH_DEMAND_MAX } from '../../api/modules/ai-plus.api';
import {
  Card,
  Tag,
  StatPill,
  SectionHeading,
  Reveal,
  RevealItem,
  EmptyState,
  SpringButton,
} from '../../components';
import { COLORS } from '../../theme/tokens';

/** 简单星级展示 */
function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`评分 ${rating}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill={i <= full ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          style={{ color: COLORS.accent }}
        >
          <path d="M12 4l2.4 5.1 5.6.7-4.1 3.9 1.1 5.6L12 16.9 6.9 19.3 8 13.7 3.9 9.8l5.6-.7z" strokeLinejoin="round" />
        </svg>
      ))}
    </span>
  );
}

export function CoachListPage() {
  const navigate = useNavigate();
  const { data: coaches = [], isLoading, isError, refetch } = useCoaches();
  const [keyword, setKeyword] = useState('');
  const [activeDomain, setActiveDomain] = useState<string>('全部');

  // P1-4 智能匹配
  const { data: matchData, loading: matching, error: matchError, errorCode: matchCode, noCoach, degraded: matchDegraded, run: runMatch, reset: resetMatch } = useCoachingMatch();
  const [demand, setDemand] = useState('');
  const demandOver = demand.length > MATCH_DEMAND_MAX;
  const doMatch = () => {
    const d = demand.trim();
    if (!d || demandOver) return;
    void runMatch({ demand: d, topN: 3 });
  };
  // 领域集合（含「全部」）
  const domains = useMemo(() => {
    const set = new Set<string>();
    coaches.forEach((c) => c.domains.forEach((d) => set.add(d)));
    return ['全部', ...set];
  }, [coaches]);

  const list = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return [...coaches]
      .sort((a, b) => b.rating - a.rating)
      .filter((c) => activeDomain === '全部' || c.domains.includes(activeDomain))
      .filter(
        (c) =>
          !kw ||
          c.name.toLowerCase().includes(kw) ||
          c.title.toLowerCase().includes(kw) ||
          c.domains.some((d) => d.toLowerCase().includes(kw)),
      );
  }, [coaches, keyword, activeDomain]);

  return (
    <section className="mx-auto max-w-5xl pb-20">
      <SectionHeading
        size="lg"
        eyebrow="1-ON-1 COACHING"
        title="选择你的职业辅导师"
        subtitle="真人 1v1 深度咨询——从职业转型到决策困惑，找到最懂你的那位。"
      />

      {/* P1-4 描述诉求 · AI 智能匹配辅导师 */}
      <div className="mt-8 rounded-2xl border border-brand-primary-100 bg-brand-primary-50/50 p-5">
        <p className="text-sm font-semibold text-brand-primary-900">用一句话描述你的诉求，AI 帮你匹配</p>
        <p className="mt-0.5 text-xs text-neutral-500">例如：想从测试转产品经理，缺乏方法论，希望有过转型经验的导师。</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="flex-1">
            <textarea
              value={demand}
              onChange={(e) => setDemand(e.target.value)}
              rows={2}
              placeholder="描述你的职业困惑或咨询目标…"
              className="w-full resize-none rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-brand-primary-500 focus:outline-none focus:ring-2 focus:ring-brand-primary-500/20"
            />
            <div className="mt-1 flex justify-end">
              <span className={`font-mono text-xs ${demandOver ? 'text-red-600' : 'text-neutral-400'}`}>
                {demand.length}/{MATCH_DEMAND_MAX}
              </span>
            </div>
          </div>
          <SpringButton variant="accent" disabled={matching || !demand.trim() || demandOver} onClick={doMatch}>
            {matching ? '匹配中…' : '智能匹配'}
          </SpringButton>
        </div>

        {matchError ? (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {matchError}
            {matchCode ? <span className="ml-1 font-mono text-xs opacity-70">({matchCode})</span> : null}
          </p>
        ) : null}

        {noCoach ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            暂时没有完全匹配的辅导师，你可以浏览下方全部辅导师，或稍后再试。
          </p>
        ) : null}

        {matchData && matchData.matches.length > 0 ? (
          <div className="mt-3">
            {matchDegraded ? (
              <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
                当前为规则版匹配（AI 服务繁忙），结果仍可参考。
              </p>
            ) : null}
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-neutral-500">为你推荐 {matchData.matches.length} 位辅导师</p>
              <button type="button" onClick={() => { resetMatch(); setDemand(''); }} className="text-xs text-neutral-400 hover:underline">
                清除
              </button>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {matchData.matches.map((m) => (
                <button
                  key={m.coachId}
                  type="button"
                  onClick={() => navigate(`/app/coaching/coaches/${m.coachId}`)}
                  className="rounded-xl border border-neutral-200 bg-white p-3 text-left transition-shadow hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-800">{m.name}</span>
                    <Tag tone="accent" size="sm">{Math.round(m.matchScore)}分</Tag>
                  </div>
                  <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-neutral-500">{m.reason}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* 搜索 + 领域筛选 */}
      <div className="mt-8 flex flex-col gap-4">
        <label className="relative block max-w-md">
          <span className="sr-only">搜索辅导师</span>
          <input
            type="search"
   value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索辅导师姓名、领域或关键词…"
            className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-brand-primary-500 focus:outline-none focus:ring-2 focus:ring-brand-primary-500/20"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {domains.map((d) => {
            const active = d === activeDomain;
            return (
              <button
                key={d}
                onClick={() => setActiveDomain(d)}
                aria-pressed={active}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-normal ${
                  active
                    ? 'bg-brand-primary-500 text-white shadow-sm'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      {/* 结果区 */}
      {isLoading ? (
        <p className="mt-12 text-center font-serif text-neutral-400">加载辅导师…</p>
      ) : isError ? (
        <div className="mt-10">
          <EmptyState
            icon="compass"
            title="辅导师加载失败"
            description="可能是网络或服务异常，请稍后重试。"
            action={<SpringButton onClick={() => refetch()}>重新加载</SpringButton>}
          />
        </div>
      ) : list.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon="search"
            title="没有符合条件的辅导师"
            description="换个领域或关键词试试，或清空筛选查看全部辅导师。"
          />
        </div>
      ) : (
        <Reveal
          className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2"
          deps={[activeDomain, keyword, list.length]}
        >
          {list.map((c, i) => (
            <RevealItem key={c.id} index={i}>
              <Card
                padding="md"
                interactive
                onClick={() => navigate(`/app/coaching/coaches/${c.id}`)}
                className="flex h-full cursor-pointer flex-col"
              >
                <div className="flex items-start gap-4">
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full font-display text-lg font-bold text-white"
                   style={{ backgroundColor: COLORS.accent }}
                  >
                    {c.avatar ? (
                      <img src={c.avatar} alt={c.name} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      c.name.slice(0, 1)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-display text-lg font-bold text-brand-primary-950">{c.name}</h3>
                      {c.closed ? <Tag tone="neutral" size="sm">暂停接单</Tag> : null}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-neutral-500">{c.title}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Stars rating={c.rating} />
                      <span className="font-mono text-xs text-neutral-400">
                        {c.rating.toFixed(1)} · {c.reviewCount} 评价
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {c.domains.map((d) => (
                    <Tag key={d} tone="brand" size="sm">
                      {d}
                    </Tag>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <StatPill value={`¥${c.price}`} label="/ 次" tone="accent" />
                  {c.orderCount ? (
                    <span className="font-mono text-xs text-neutral-400">已咨询 {c.orderCount} 次</span>
                  ) : null}
                </div>
              </Card>
            </RevealItem>
          ))}
        </Reveal>
      )}
    </section>
  );
}

export default CoachListPage;