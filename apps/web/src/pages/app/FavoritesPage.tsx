/**
 * P24 我的收藏页（/app/me/favorites）
 * -------------------------------------------------------------
 * 收藏数据走真实后端接口（GET /careers/favorites，见 useFavoriteList）。
 * 展示收藏的职业卡片（风格对齐 CareerListPage），支持取消收藏、点击进入详情。
 * 加载态 / 空态 / 错误态完整兜底，错误态非白屏。
 */
import { useNavigate } from 'react-router-dom';
import { useFavoriteList, useFavoriteActions } from '../../hooks/useFavorites';
import { ApiError } from '../../api/client';
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
  const { data, isLoading, isError, error, refetch } = useFavoriteList();
  const { removeFavorite } = useFavoriteActions();

  const list = data?.list ?? [];

  const handleRemove = async (careerId: number) => {
    try {
      await removeFavorite(careerId);
    } catch (err) {
      if (err instanceof ApiError) window.alert(err.message);
    }
  };

  return (
    <section className="mx-auto max-w-5xl pb-20">
      <SectionHeading
        size="lg"
        eyebrow="MY FAVORITES"
        title="我的收藏"
        subtitle="你标记为感兴趣的职业方向，都会保留在这里。"
      />

      {isLoading ? (
        // 加载态：骨架占位，非白屏
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-2xl bg-neutral-100"
              aria-hidden
            />
          ))}
        </div>
      ) : isError ? (
        // 错误态：展示后端 message + 重试，禁止白屏
        <div className="mt-10">
          <EmptyState
            icon="search"
            title="收藏加载失败"
            description={
              (error instanceof ApiError && error.message) ||
              '网络异常，请稍后重试。'
            }
         action={
              <SpringButton variant="accent" onClick={() => void refetch()}>
                重试
              </SpringButton>
            }
          />
        </div>
      ) : list.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon="search"
            title="还没有收藏的职业"
            description="在职业匹配页点击星标，把感兴趣的职业方向收藏到这里，随时回顾对比。"
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
          deps={[list.length]}
        >
          {list.map((c, i) => (
            <RevealItem key={c.favoriteId} index={i}>
              <Card
                padding="md"
                interactive
                onClick={() => navigate(`/app/career/${c.careerId}`)}
                className="flex h-full cursor-pointer flex-col"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-lg font-bold text-brand-primary-950">
                      {c.name}
                    </h3>
                    <span className="font-mono text-xs text-neutral-400">{c.category}</span>
                  </div>
                  <button
                    type="button"
                    aria-label="取消收藏"
                    aria-pressed
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleRemove(c.careerId);
                    }}
                    className="shrink-0 rounded-full p-1.5 transition-colors hover:bg-neutral-100"
                    style={{ color: COLORS.accent }}
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" stroke="currentColor" strokeWidth="2">
                      <path d="M12 4l2.4 5.1 5.6.7-4.1 3.9 1.1 5.6L12 16.9 6.9 19.3 8 13.7 3.9 9.8l5.6-.7z" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-neutral-600">
                  {c.outlook || '暂无发展前景描述'}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {c.salaryRange ? <StatPill value={c.salaryRange} tone="accent" /> : null}
                  {c.category ? (
                    <Tag tone="neutral" size="sm">
                      {c.category}
                    </Tag>
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

export default FavoritesPage;