/**
 * P3-3 职业热点日报页（/app/daily-brief，登录可见）
 * - fetch(date?) 拉取当日/指定日期日报，渲染 items（title/summary/关联职业跳转）
 * - 4004 当日无日报 → 空态引导（非报错弹窗）
 * - 订阅设置：enabled 开关 + categories 多选，updateSubscription 保存
 * - 权限/有效期判断全后端，前端仅基础交互
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  SectionHeading,
  SpringButton,
  Tag,
  EmptyState,
  BackButton,
} from '../../components';
import { useDailyBrief } from '../../hooks/useAiPlus';

/** 可订阅品类（前端展示用，后端按 categories 字符串接收）。 */
const CATEGORY_OPTIONS = ['互联网', '金融', '教育', '医疗', '制造', '文创', '公共服务'];

export function DailyBriefPage() {
  const navigate = useNavigate();
  const { data, subscription, loading, error, noBrief, fetch, updateSubscription } =
    useDailyBrief();

  const [date, setDate] = useState('');
  const [subEnabled, setSubEnabled] = useState(false);
  const [subCategories, setSubCategories] = useState<string[]>([]);
  const [savedTip, setSavedTip] = useState(false);

  // 首次进入拉取今日日报
  useEffect(() => {
    void fetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 后端返回订阅信息时同步本地表单
  useEffect(() => {
    if (subscription) {
      setSubEnabled(subscription.enabled);
      setSubCategories(subscription.categories ?? []);
    }
  }, [subscription]);

  const toggleCategory = (c: string) => {
    setSubCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  };

  const handleSaveSub = async () => {
    setSavedTip(false);
    const res = await updateSubscription({ enabled: subEnabled, categories: subCategories });
    if (res) setSavedTip(true);
  };

  return (
    <article className="mx-auto max-w-3xl px-4 pb-20 pt-6">
      <BackButton />

      <SectionHeading
        eyebrow="Daily Brief"
        title="职业热点日报"
        subtitle="每日为你梳理职业趋势与行业动态。"
        size="lg"
        as="h1"
      />

      {/* 日期查询 */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
        />
        <SpringButton variant="primary" onClick={() => fetch(date || undefined)} disabled={loading}>
          {loading ? '加载中…' : '查询'}
        </SpringButton>
      </div>

      {/* 报错（非 4004） */}
      {error && !noBrief && (
        <div className="mt-4 rounded-xl border border-red-300/70 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 空态：当日无日报 */}
      {noBrief && (
        <div className="mt-6">
          <EmptyState
            icon="search"
            title="当日暂无日报"
            description="换个日期看看，或订阅感兴趣的品类以便及时收到更新。"
          />
        </div>
      )}

      {/* 日报内容 */}
      {data && data.items.length > 0 && (
        <div className="mt-6">
          <p className="text-xs text-neutral-400">{data.date}</p>
          <div className="mt-3 space-y-3">
            {data.items.map((item, i) => (
              <Card key={`${data.briefId}-${i}`} padding="md">
                <h3 className="text-base font-semibold text-neutral-900">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{item.summary}</p>
                {item.careerId && (
                  <div className="mt-3">
                    <SpringButton
                      variant="ghost"
                      onClick={() => navigate(`/app/career/${item.careerId}`)}
                    >
                      查看关联职业
                    </SpringButton>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {data && data.items.length === 0 && !noBrief && (
        <div className="mt-6">
          <EmptyState icon="sparkle" title="今日暂无条目" description="稍后再来看看。" />
        </div>
      )}

      {/* 订阅设置 */}
      <section className="mt-12 border-t border-neutral-200/70 pt-10">
        <SectionHeading eyebrow="Subscription" title="订阅设置" size="md" as="h2" />

        <label className="mt-4 flex items-center gap-3 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={subEnabled}
            onChange={(e) => setSubEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300"
          />
          开启日报订阅
        </label>

        <div className="mt-4">
          <p className="text-sm text-neutral-500">感兴趣的品类</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggleCategory(c)}
                className={`rounded-full border px-4 py-1.5 text-sm transition ${
                  subCategories.includes(c)
                    ? 'border-transparent bg-neutral-900 text-white'
                    : 'border-neutral-300 text-neutral-600 hover:border-neutral-400'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <SpringButton variant="accent" onClick={handleSaveSub} disabled={loading}>
            {loading ? '保存中…' : '保存订阅设置'}
          </SpringButton>
          {savedTip && <Tag>已保存</Tag>}
        </div>
      </section>
    </article>
  );
}

export default DailyBriefPage;