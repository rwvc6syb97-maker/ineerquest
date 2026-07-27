/**
 * P12 职业匹配页（/app/career?reportId=&mbti=）
 * -------------------------------------------------------------
 * 精致化重构：TOP 职业按匹配度排序，卡片墙错落（非三等分栅格），
 *  每卡 mono 匹配度数值 + 进度条（橙指引）、薪资 StatPill、标签 Tag；
 *  分类 Chip 筛选 + 关键词搜索 + 收藏。点击跳 P13。
 * 收藏走真实后端接口（useFavorites，React Query），收藏态由服务端列表驱动，
 *  未登录点击收藏（后端返 4010）引导登录。
 */
import { useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useRecommendCareers, useCareerLibrary } from '../../hooks/useCareer';
import { useFavorites } from '../../hooks/useFavorites';
import { ApiError } from '../../api/client';
import { CommonCode, BizCode } from '@innerquest/shared';
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

export function CareerListPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const reportId = params.get('reportId') || '';
  const mbti = params.get('mbti') || '';
  // 缺陷2：去除 reportId 强依赖——无 reportId 也照常请求推荐，后端自动取最近报告
  const {
    data: careers = [],
    isLoading,
    error: recommendError,
  } = useRecommendCareers(reportId);

  // 仅当后端返回 CAREER_NO_ASSESSMENT(4401) 才引导用户先完成测评
  const noAssessment =
    recommendError instanceof ApiError &&
    recommendError.code === BizCode.CAREER_NO_ASSESSMENT;

  const [keyword, setKeyword] = useState('');
  const [activeCat, setActiveCat] = useState<string>('全部');
  const { isFavorite, toggleFavorite } = useFavorites();

  // 职业库全量浏览区（推荐岗位之外的其它职业库内容，GET /careers 分页）
  const { data: library, isLoading: libLoading } = useCareerLibrary({
    page: 1,
    pageSize: 12,
  });
  // data 判空：防 undefined 崩溃；剔除已在推荐区展示的岗位
  const libraryList = useMemo(() => {
    const recIds = new Set(careers.map((c) => c.id));
    return (library?.list ?? []).filter((c) => !recIds.has(c.id));
  }, [library, careers]);

  const goLogin = () => {
    const back = `/app/career${window.location.search}`;
    navigate(`/auth/login?redirect=${encodeURIComponent(back)}`);
  };

  const toggleFav = async (id: string) => {
    try {
      await toggleFavorite(id);
    } catch (err) {
      // 未登录：引导登录；其余业务错误（如 4403 重复/4402 下架）用后端 message 提示
      if (err instanceof ApiError && err.code === CommonCode.UNAUTHORIZED) {
        goLogin();
        return;
      }
      if (err instanceof ApiError) {
        window.alert(err.message);
      }
    }
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

  // 复用卡片渲染（推荐区与职业库区共用）
  const renderCard = (c: (typeof careers)[number], i: number) => {
    const score = c.matchScore;
    const hasScore = typeof score === 'number';
    const tall = i % 3 === 0;
    const faved = isFavorite(c.id);
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
                void toggleFav(c.id);
              }}
              className="shrink-0 rounded-full p-1.5 text-neutral-300 transition-colors hover:bg-neutral-100"
              style={faved ? { color: COLORS.accent } : undefined}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill={faved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M12 4l2.4 5.1 5.6.7-4.1 3.9 1.1 5.6L12 16.9 6.9 19.3 8 13.7 3.9 9.8l5.6-.7z" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* 匹配度 mono 数值 + 进度条（橙指引）——仅推荐岗位有 matchScore */}
          {hasScore ? (
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
  };

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

      {/* ============ 推荐结果区 ============ */}
      {noAssessment ? (
        // 缺陷2：仅当后端返回 CAREER_NO_ASSESSMENT(4401) 才引导先完成测评
        <div className="mt-10">
          <EmptyState
            icon="sparkle"
            title="先完成一次测评，解锁专属职业推荐"
            description="职业匹配基于你的人格报告生成。请先完成一次测评生成报告，再查看与你匹配的职业方向；或直接浏览下方职业库。"
            action={
              <button
                onClick={() => navigate('/assessment')}
                className="rounded-full bg-brand-primary-500 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-primary-600"
              >
                去做测评
              </button>
            }
          />
          <div className="mt-4 text-center">
            <button
              onClick={() => navigate('/app/report/history')}
              className="text-sm font-medium text-brand-primary-500 hover:text-brand-primary-600"
            >
              已有报告？去我的报告 →
            </button>
          </div>
        </div>
      ) : isLoading ? (
        <p className="mt-12 text-center font-serif text-neutral-400">匹配计算中…</p>
      ) : list.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon="search"
            title="没有符合条件的推荐"
            description="换个关键词或分类试试，或浏览下方职业库全量内容。"
          />
        </div>
      ) : (
        <Reveal
          className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
          deps={[activeCat, keyword, list.length]}
        >
          {list.map((c, i) => renderCard(c, i))}
        </Reveal>
      )}

      {/* ============ 职业库全量浏览区（推荐之外的其它职业库内容，GET /careers） ============ */}
      {/* 缺陷①：无条件渲染职业库全量区，与推荐是否可用解耦。
          无报告用户（noAssessment=true，recIds 为空集）此处仍展示全量 16 条职业库。 */}
      <section className="mt-16 border-t border-neutral-200/70 pt-10">
        <SectionHeading
          size="md"
          eyebrow="CAREER LIBRARY"
          title="职业库全量浏览"
          subtitle="探索推荐之外的更多职业方向。"
        />
        {libLoading ? (
          <p className="mt-8 text-center font-serif text-neutral-400">加载中…</p>
        ) : libraryList.length === 0 ? (
          <div className="mt-8">
            <EmptyState icon="search" title="暂无更多职业" description="职业库内容持续更新中。" />
          </div>
        ) : (
          <Reveal
            className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
            deps={[libraryList.length]}
          >
            {libraryList.map((c, i) => renderCard(c, i))}
          </Reveal>
        )}
      </section>
    </section>
  );
}

export default CareerListPage;