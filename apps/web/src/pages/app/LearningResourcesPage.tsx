/**
 * P17 学习资源推荐页（/app/learning/resources）
 * -------------------------------------------------------------
 * 按技能标签筛选的学习资源卡片墙（课程 / 书籍 / 文章 / 视频）。
 * 数据 hook useLearningResources，失败自动 mock fallback。
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Tag, SectionHeading, Reveal, RevealItem, EmptyState } from '../../components';
import { COLORS } from '../../theme/tokens';
import { useLearningResources } from '../../hooks/useCareerPlan';
import type { ResourceType } from '../../api/modules/career-plan.api';

const TYPE_LABEL: Record<ResourceType, string> = {
  course: '课程',
  book: '书籍',
  article: '文章',
  video: '视频',
};

const TYPE_ICON: Record<ResourceType, string> = {
  course: '🎓',
  book: '📖',
  article: '📝',
  video: '🎬',
};

export function LearningResourcesPage() {
  const [params] = useSearchParams();
  const skill = params.get('skill') || undefined;
  const careerId = params.get('careerId') || undefined;
  const { data: resources = [], isLoading } = useLearningResources({ skill, careerId });

  const [typeFilter, setTypeFilter] = useState<ResourceType | '全部'>('全部');
  const [tagFilter, setTagFilter] = useState<string>('全部');

  // 全部技能标签集合
  const allTags = useMemo(() => {
    const set = new Set<string>();
    resources.forEach((r) => r.skillTags.forEach((t) => set.add(t)));
    return ['全部', ...set];
  }, [resources]);

  const filtered = useMemo(
    () =>
      resources.filter(
        (r) =>
          (typeFilter === '全部' || r.resourceType === typeFilter) &&
          (tagFilter === '全部' || r.skillTags.includes(tagFilter)),
      ),
    [resources, typeFilter, tagFilter],
  );

  const types: (ResourceType | '全部')[] = ['全部', 'course', 'book', 'article', 'video'];

  return (
    <section className="mx-auto max-w-5xl pb-12">
      <SectionHeading
        size="lg"
        eyebrow="LEARNING"
        title="学习资源推荐"
        subtitle="围绕你的技能短板，精选可立即上手的课程、书籍与文章。"
      />

      {/* 筛选区 */}
      <div className="mt-6 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                typeFilter === t ? 'text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
              style={typeFilter === t ? { backgroundColor: COLORS.brand } : undefined}
            >
              {t === '全部' ? '全部类型' : TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTagFilter(tag)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                tagFilter === tag
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
              }`}
            >
              {tag}
            </button>
          ))}
     </div>
      </div>

      {/* 资源卡片墙 */}
      {isLoading ? (
        <p className="mt-10 text-center text-sm text-neutral-400">加载中…</p>
      ) : filtered.length === 0 ? (
        <div className="mt-8">
          <EmptyState icon="search" title="没有匹配的资源" description="试试切换类型或技能标签。" />
        </div>
      ) : (
        <Reveal className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filtered.map((r) => (
            <RevealItem key={r.id}>
              <a
                href={r.url || undefined}
                target={r.url ? '_blank' : undefined}
                rel={r.url ? 'noreferrer' : undefined}
                className="block h-full"
              >
                <Card padding="none" interactive className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-2xl" aria-hidden>{TYPE_ICON[r.resourceType]}</span>
                    <Tag tone="brand">{TYPE_LABEL[r.resourceType]}</Tag>
                  </div>
                  <h3 className="font-display text-base font-semibold leading-snug text-brand-primary-950">
                    {r.title}
                  </h3>
                  {r.provider && <p className="text-xs text-neutral-400">来源 · {r.provider}</p>}
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    {r.skillTags.map((t) => (
                      <span key={t} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                        {t}
                      </span>
                    ))}
                  </div>
              </Card>
              </a>
            </RevealItem>
          ))}
        </Reveal>
      )}
    </section>
  );
}

export default LearningResourcesPage;