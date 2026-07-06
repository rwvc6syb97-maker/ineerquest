/**
 * P28 职业百科页（/app/careers/wiki）
 * -------------------------------------------------------------
 * 职业检索库：关键词搜索 + 分类筛选，卡片墙浏览。
 * 复用 useRecommendCareers（无 reportId 时返回全量 mock），点击跳 P13 职业详情。
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRecommendCareers } from '../../hooks/useCareer';
import {
  Card,
  Tag,
  StatPill,
  SectionHeading,
  Reveal,
  RevealItem,
  EmptyState,
} from '../../components';

export function CareerWikiPage() {
  const navigate = useNavigate();
  // 无 reportId：hook 直接返回全量职业库（mock 兜底）
  const { data: careers = [], isLoading } = useRecommendCareers('');

  const [keyword, setKeyword] = useState('');
  const [activeCat, setActiveCat] = useState<string>('全部');

  const categories = useMemo(() => {
    const set = new Set(careers.map((c) => c.category));
    return ['全部', ...set];
  }, [careers]);

  const list = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return careers
      .filter((c) => activeCat === '全部' || c.category === activeCat)
      .filter(
        (c) =>
          !kw ||
          c.title.toLowerCase().includes(kw) ||
          c.summary.toLowerCase().includes(kw) ||
          c.tags.some((t) => t.toLowerCase().includes(kw)),
      );
  }, [careers, keyword, activeCat]);

  return (
    <section className="mx-auto max-w-5xl pb-20">
      <SectionHeading
        size="lg"
        eyebrow="CAREER WIKI"
        title="职业百科"
        subtitle="检索与浏览职业库——了解职责、薪资与所需能力，找到值得探索的方向。"
      />

      {/* 搜索 + 分类筛选 */}
      <div className="mt-8 flex flex-col gap-4">
        <label className="relative block max-w-md">
          <span className="sr-only">搜索职业</span>
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索职业名称、技能或关键词…"
            className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-brand-primary-500 focus:outline-none focus:ring-2 focus:ring-brand-primary-500/20"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => {
            const active = cat === activeCat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCat(cat)}
                aria-pressed={active}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-normal ${
                  active
                    ? 'bg-brand-primary-500 text-white shadow-sm'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* 结果区 */}
      {isLoading ? (
        <p className="mt-12 text-center font-serif text-neutral-400">加载职业库…</p>
      ) : list.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon="search"
            title="没有符合条件的职业"
            description="换个关键词或分类试试，或清空筛选查看全部职业。"
          />
        </div>
      ) : (
        <Reveal
          className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
          deps={[activeCat, keyword, list.length]}
        >
          {list.map((c, i) => (
            <RevealItem key={c.id} index={i}>
              <Card
                padding="md"
                interactive
                onClick={() => navigate(`/app/career/${c.id}`)}
                className="flex h-full cursor-pointer flex-col"
              >
                <div className="min-w-0">
                  <h3 className="truncate font-display text-lg font-bold text-brand-primary-950">
                    {c.title}
                  </h3>
                  <span className="font-mono text-xs text-neutral-400">{c.category}</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-neutral-600">{c.summary}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {c.salaryRange ? <StatPill value={c.salaryRange} tone="accent" /> : null}
                  {c.tags.map((t) => (
                    <Tag key={t} tone="neutral" size="sm">
                      {t}
                    </Tag>
                  ))}
                </div>
              </Card>
            </RevealItem>
          ))}
        </Reveal>
      )}
    </section>
  );
}

export default CareerWikiPage;