/**
 * P19 辅导师列表（/app/coaching/coaches）
 * -------------------------------------------------------------
 * 浏览与筛选辅导师：领域 Chip 筛选 + 关键词搜索 + 评分/价格展示。
 * 卡片点击进入 P20 详情。数据 hook useCoaches（含 mock 兜底）。
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCoaches } from '../../hooks/useCoaching';
import {
  Card,
  Tag,
  StatPill,
  SectionHeading,
  Reveal,
  RevealItem,
  EmptyState,
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
  const { data: coaches = [], isLoading } = useCoaches();

  const [keyword, setKeyword] = useState('');
  const [activeDomain, setActiveDomain] = useState<string>('全部');

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