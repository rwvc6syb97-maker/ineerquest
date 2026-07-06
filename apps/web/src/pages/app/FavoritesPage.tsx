/**
 * P24 我的收藏页（/app/me/favorites）
 * -------------------------------------------------------------
 * 后端暂无收藏接口，收藏数据由 localStorage 持久化（key: 'iq:favorites'，见 useFavorites）。
 * 展示收藏的职业卡片（风格对齐 CareerListPage），支持取消收藏、点击进入详情。
 * 空态用 EmptyState 兜底，引导去业匹配页收藏。
 */
import { useNavigate } from 'react-router-dom';
import { useFavorites } from '../../hooks/useFavorites';
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

export function FavoritesPage() {
  const navigate = useNavigate();
  const { favorites, removeFavorite } = useFavorites();

  return (
    <section className="mx-auto max-w-5xl pb-20">
      <SectionHeading
        size="lg"
        eyebrow="MY FAVORITES"
        title="我的收藏"
        subtitle="你标记为感兴趣的职业方向，都会保留在这里。"
      />

      {favorites.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon="search"
            title="还没有收藏的职业"
            description="在职业匹配页点击星标，把感兴趣的职业方向收藏到这里，随时回顾比。"
            action={
              <SpringButton variant="accent" onClick={() => navigate('/app/career')}>
                去发现职业
              </SpringButton>
            }
          />
        </div>
      ) : (
        <Reveal
          className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
          deps={[favorites.length]}
        >
          {favorites.map((c, i) => {
            const score = c.matchScore ?? 0;
            return (
              <RevealItem key={c.id} index={i}>
                <Card
                  padding="md"
                  interactive
                  onClick={() => navigate(`/app/career/${c.id}`)}
                  className="flex h-full cursor-pointer flex-col"
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
                      aria-label="取消收藏"
                      aria-pressed
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFavorite(c.id);
                      }}
                      className="shrink-0 rounded-full p-1.5 transition-colors hover:bg-neutral-100"
                      style={{ color: COLORS.accent }}
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" stroke="currentColor" strokeWidth="2">
                   <path d="M12 4l2.4 5.1 5.6.7-4.1 3.9 1.1 5.6L12 16.9 6.9 19.3 8 13.7 3.9 9.8l5.6-.7z" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>

                  {score ? (
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
                  ) : null}

                  <p className="mt-4 text-sm leading-relaxed text-neutral-600">{c.summary}</p>

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
            );
          })}
        </Reveal>
      )}
    </section>
  );
}

export default FavoritesPage;