/**
 * P20 辅导师详情（/app/coaching/coaches/:coachId）
 * -------------------------------------------------------------
 * 辅导师资料、擅长领域、精选评价、可约提示。底部 CTA 进入 P21 预约。
 * 60002 停止接单：禁用预约按钮并提示。数据 hook useCoachDetail（失败呈现错误态并支持重试）。
 */
import { useParams, useNavigate } from 'react-router-dom';
import { useCoachDetail } from '../../hooks/useCoaching';
import { ApiError } from '../../api';
import { BizCode } from '@innerquest/shared';
import {
  Card,
  Tag,
  StatPill,
  SectionHeading,
  Reveal,
  RevealItem,
  SpringButton,
  BackButton,
  EmptyState,
} from '../../components';
import { COLORS } from '../../theme/tokens';

function Stars({ rating, size = 3.5 }: { rating: number; size?: number }) {
  const full = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`评分 ${rating}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          style={{ color: COLORS.accent, width: `${size * 4}px`, height: `${size * 4}px` }}
          fill={i <= full ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 4l2.4 5.1 5.6.7-4.1 3.9 1.1 5.6L12 16.9 6.9 19.3 8 13.7 3.9 9.8l5.6-.7z" strokeLinejoin="round" />
        </svg>
      ))}
    </span>
  );
}

export function CoachDetailPage() {
  const { coachId = '' } = useParams();
  const navigate = useNavigate();
  const { data: coach, isLoading, isError, error, refetch } = useCoachDetail(coachId);

  if (isLoading) {
    return <p className="mt-20 text-center font-serif text-neutral-400">加载辅导师资料…</p>;
  }

  if (isError || !coach) {
    // C2：规划师不存在（4708）单独提示，文案优先用后端 message
    const notFound = error instanceof ApiError && error.code === BizCode.COACH_NOT_FOUND;
    return (
      <section className="mx-auto max-w-3xl pb-28">
        <BackButton to="/app/coaching/coaches" label="返回辅导师列表" className="mb-4" />
        {notFound ? (
          <EmptyState
            icon="compass"
            title="规划师不存在"
            description={(error as ApiError).message || '该规划师不存在或已下架，请返回列表重新选择。'}
            action={
              <SpringButton onClick={() => navigate('/app/coaching/coaches')}>
                返回辅导师列表
              </SpringButton>
            }
          />
        ) : (
          <EmptyState
            icon="compass"
            title="辅导师资料加载失败"
            description="可能是网络或服务异常，请稍后重试。"
            action={<SpringButton onClick={() => refetch()}>重新加载</SpringButton>}
          />
        )}
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl pb-28">
      {/* 返回上一级：辅导师列表 */}
      <BackButton to="/app/coaching/coaches" label="返回辅导师列表" className="mb-4" />
      {/* 头部资料 */}
      <Reveal deps={[coach.id]}>
        <RevealItem index={0}>
          <Card padding="lg" className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div
              className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full font-display text-2xl font-bold text-white"
              style={{ backgroundColor: COLORS.accent }}
            >
              {coach.avatar ? (
                <img src={coach.avatar} alt={coach.name} className="h-full w-full rounded-full object-cover" />
              ) : (
                coach.name.slice(0, 1)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-brand-primary-950">{coach.name}</h1>
                {coach.closed ? <Tag tone="neutral" size="sm">暂停接单</Tag> : null}
              </div>
              <p className="mt-1 text-sm text-neutral-500">{coach.title}</p>
              <div className="mt-2 flex items-center gap-2">
                <Stars rating={coach.rating} />
                <span className="font-mono text-xs text-neutral-400">
                  {coach.rating.toFixed(1)} · {coach.reviewCount} 评价
                </span>
              </div>
            </div>
            <div className="flex gap-3 sm:flex-col sm:items-end">
              <StatPill value={`¥${coach.price}`} label="/ 次" tone="accent" />
              {coach.durationMin ? <StatPill value={`${coach.durationMin}min`} label="时长" /> : null}
            </div>
          </Card>
        </RevealItem>
      </Reveal>

      {/* 擅长领域 */}
      <div className="mt-8">
        <SectionHeading size="md" title="擅长领域" />
        <div className="mt-3 flex flex-wrap gap-2">
          {coach.domains.map((d) => (
            <Tag key={d} tone="brand">
              {d}
            </Tag>
          ))}
        </div>
      </div>

      {/* 简介 */}
      <div className="mt-8">
        <SectionHeading size="md" title="辅导师简介" />
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">{coach.intro}</p>
        {coach.experienceYears ? (
          <p className="mt-2 font-mono text-xs text-neutral-400">从业 {coach.experienceYears} 年</p>
        ) : null}
      </div>

      {/* 精选评价 */}
      <div className="mt-8">
        <SectionHeading size="md" title={`用户评价（${coach.reviewCount}）`} />
        {coach.reviews.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">暂无评价</p>
        ) : (
          <Reveal className="mt-3 flex flex-col gap-3" deps={[coach.id]}>
            {coach.reviews.map((r, i) => (
              <RevealItem key={r.id} index={i}>
                <Card padding="md">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-neutral-700">{r.userName}</span>
                    <Stars rating={r.rating} size={3} />
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600">{r.content}</p>
                  <span className="mt-2 block font-mono text-xs text-neutral-400">
                    {new Date(r.createdAt).toLocaleDateString('zh-CN')}
                  </span>
                </Card>
              </RevealItem>
            ))}
          </Reveal>
        )}
      </div>

      {/* 底部固定 CTA */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <span
              className="font-mono text-lg font-semibold tabular-nums"
              style={{ color: COLORS.accent }}
            >
              ¥{coach.price}
            </span>
            <span className="ml-1 text-xs text-neutral-400">/ 次咨询</span>
          </div>
          {coach.closed ? (
            <SpringButton variant="ghost" disabled>
              暂停接单
            </SpringButton>
          ) : (
            <SpringButton
              variant="accent"
              onClick={() => navigate(`/app/coaching/booking/${coach.id}`)}
            >
              预约咨询
            </SpringButton>
          )}
        </div>
      </div>
    </section>
  );
}

export default CoachDetailPage;