/**
 * P12 职业匹配页（/app/career?reportId=&mbti=）
 * -------------------------------------------------------------
 * 精致化重构：TOP 职业按匹配度排序，卡片墙错落（非三等分栅格），
 *  每卡 mono 匹配度数值 + 进度条（橙指引）、薪资 StatPill、标签 Tag；
 *  分类 Chip 筛选 + 关键词搜索 +地收藏。点击跳 P13。
 * 数据 hook（useRecommendCareers）与 mock 兜底保持不变，仅重构 UI。
 */
import { useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
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
import { COLORS } from '../../theme/tokens';

const FAV_KEY = 'iq_career_favorites';

function loadFavorites(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(FAV_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

export function CareerListPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const reportId = params.get('reportId') || '';
  const mbti = params.get('mbti') || '';
  const { data: careers = [], isLoading } = useRecommendCareers(reportId);

  const [keyword, setKeyword] = useState('');
  const [activeCat, setActiveCat] = useState<string>('全部');
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);

  const toggleFav = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(FAV_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  // 分类集合（含「全部」）
  const categories = useMemo(() => {
    const set = new Set(careers.map((c) => c.category));
    return ['全部', ...set];
  }, [careers]);

  // 排序 + 筛选 + 搜索
  const list = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return [...careers]
      .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
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
      {/* ============ 头部（左对齐，非居中） ============ */}
      <SectionHeading
        size="lg"
        eyebrow="CAREER MATCH"
        title="与你匹配的职业方向"
        subtitle={
          mbti
            ? `基于「${mbti}」人格类型的认知偏好，为你排出的匹配 TOP 榜单。`
            : '基于你的人格倾向的通用推荐——方向比标签更重要。'
        }
      />

      {/* 入口：浏览全部职业百科 */}
      <button
        onClick={() => navigate('/app/careers/wiki')}
        className="mt-4 text-sm font-medium text-brand-primary-500 hover:text-brand-primary-600"
      >
        浏览全部职业百科 →
      </button>

      {/* ============ 搜索 + 分类筛选 ============ */}
      <div className="mt-8 flex flex-col gap-4">
        <label className="relative block max-w-md">
          <span className="sr-only">搜索业</span>
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

      {/* ============ 结果区 ============ */}
      {isLoading ? (
        <p className="mt-12 text-center font-serif text-neutral-400">匹配计算中…</p>
      ) : list.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon="search"
            title="没有符合条件的职业"
            description="换个关键词或分类试试，或清空筛选查看全部匹配结果。"
          />
        </div>
      ) : (
        <Reveal
          className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
          deps={[activeCat, keyword, list.length]}
        >
          {list.map((c, i) => {
            const score = c.matchScore ?? 0;
            // 错落：每第 3 张（lg 下）纵向占 2 行制造墙面节奏
            const tall = i % 3 === 0;
            const faved = favorites.has(c.id);
            return (
              <RevealItem key={c.id} index={i} className={tall ? 'lg:row-span-2' : ''}>
                <Card
                  padding="md"
                  interactive
                  onClick={() => navigate(`/app/career/${c.id}`)}
                  className={`flex h-full cursor-pointer flex-col ${tall ? 'lg:justify-between' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-lg font-bold text-brand-primary-950">
                        {c.title}
                      </h3>
                      <span className="font-mono text-xs text-neutral-400">{c.category}</span>
                    </div>
                    <button
                      type="button"
                      aria-label={faved ? '取消收藏' : '收藏'}
                      aria-pressed={faved}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFav(c.id);
                      }}
                      className="shrink-0 rounded-full p-1.5 text-neutral-300 transition-colors hover:bg-neutral-100"
                      style={faved ? { color: COLORS.accent } : undefined}
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill={faved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                        <path d="M12 4l2.4 5.1 5.6.7-4.1 3.9 1.1 5.6L12 16.9 6.9 19.3 8 13.7 3.9 9.8l5.6-.7z" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>

                  {/* 匹配度 mono 数值 + 进度条（橙指引） */}
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="font-sans text-xs font-medium text-neutral-500">匹配度</span>
                      <span
                        className="font-mono text-base font-semibold tabular-nums"
                        style={{ color: COLORS.accent }}
                      >
                        {score}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${score}%`,
                          backgroundColor: COLORS.accent,
                          transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
                        }}
                      />
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-neutral-600">{c.summary}</p>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {c.salaryRange ? (
                      <StatPill value={c.salaryRange} tone="accent" />
                    ) : null}
                    {c.tags.map((t) => (
                      <Tag key={t} tone="neutral" size="sm">
                        {t}
                      </Tag>
                    ))}
                  </div>
                </Card>
              </RevealItem>
            );
          })}
        </Reveal>
      )}
    </section>
  );
}

export default CareerListPage;