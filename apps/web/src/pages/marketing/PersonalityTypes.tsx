/**
 * P02 人格类型总览（/personality-types）
 * -------------------------------------------------------------
 * 16 型按 NT/NF/SJ/SP 四大族群分组网格展示 + 族群筛选。
 * 卡片点击跳 P03 详情页。
 * 设计落点：
 * - 顶部非居中标题带（asymmetric）+ 分屏式简介，非 AI 居中套路。
 * - 族群筛选 Chip（当前族群橙色高亮为唯一强调）。
 * - 分组区块交替：每族一个色带标题 + 错落网格；Reveal 滚动揭示 + Card ease-spring hover。
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Reveal, RevealItem, SectionHeading, Card, TypeAvatar, GroupBadge } from '../../components';
import {
  FAMILY_COLORS,
  FAMILY_LABEL,
  type Family,
} from '../../theme/tokens';
import { PERSONALITY_TYPES, typesByFamily, type PersonalityType } from '../../data/personalityTypes';

const FAMILIES: Family[] = ['analyst', 'diplomat', 'sentinel', 'explorer'];

type FilterKey = 'all' | Family;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部 16 型' },
  { key: 'analyst', label: FAMILY_LABEL.analyst },
  { key: 'diplomat', label: FAMILY_LABEL.diplomat },
  { key: 'sentinel', label: FAMILY_LABEL.sentinel },
  { key: 'explorer', label: FAMILY_LABEL.explorer },
];

export function PersonalityTypes() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterKey>('all');

  const visibleFamilies = useMemo<Family[]>(
    () => (filter === 'all' ? FAMILIES : [filter]),
    [filter],
  );

  return (
    <div className="-mx-6 -my-8">
      {/* ============ 顶部标题带（非居中，分屏简介） ============ */}
      <section className="bg-white px-6 pb-14 pt-16">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-end gap-8 md:grid-cols-12">
          <div className="md:col-span-7">
            <SectionHeading
              as="h1"
              size="xl"
              eyebrow="16 PERSONALITIES"
              title={<>16 型人格，<span className="text-brand-primary-600">16 种看世界的方式</span></>}
              subtitle="从分析家到探险家，每一型都是一套独特的认知与行动系统。找到你的那一型，读懂自己的天赋与倾向。"
            />
          </div>
          <div className="md:col-span-5">
            <p className="font-mono text-sm text-neutral-400">
              共 {PERSONALITY_TYPES.length} 型 · 四大族群
            </p>
            <div className="mt-3 flex gap-2">
              {FAMILIES.map((f) => (
                <span key={f} className="h-2 flex-1 rounded-full" style={{ background: FAMILY_COLORS[f] }} />
              ))}
            </div>
          </div>
        </div>

        {/* 族群筛选 Chip */}
        <div className="mx-auto mt-10 flex max-w-6xl flex-wrap gap-2.5">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const accent = f.key !== 'all' ? FAMILY_COLORS[f.key] : undefined;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-transform duration-fast ease-spring active:scale-95 ${
                  active
                    ? 'border-transparent text-white shadow-sm'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                }`}
                style={
                  active
                    ? { backgroundColor: accent ?? '#3b82f6' }
                    : undefined
                }
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* ============ 分族群网格 ============ */}
      <section className="bg-neutral-50 px-6 py-16">
        <div className="mx-auto max-w-6xl space-y-16">
          {visibleFamilies.map((family) => (
            <FamilyGroup
              key={family}
              family={family}
              types={typesByFamily(family)}
              onSelect={(code) => navigate(`/personality-types/${code}`)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function FamilyGroup({
  family,
  types,
  onSelect,
}: {
  family: Family;
  types: PersonalityType[];
  onSelect: (code: string) => void;
}) {
  const color = FAMILY_COLORS[family];
  return (
    <div>
      {/* 族群色带标题 */}
      <div className="mb-6 flex items-center gap-4">
        <span className="h-8 w-1.5 rounded-full" style={{ background: color }} />
        <h2 className="font-display text-2xl font-bold text-brand-primary-950">{FAMILY_LABEL[family]}</h2>
        <span className="font-mono text-sm text-neutral-400">{types.length} 型</span>
      </div>

      <Reveal className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4" as="div">
        {types.map((t, i) => (
          <RevealItem key={t.code} index={i}>
            <Card
              interactive
              padding="md"
              role="button"
              tabIndex={0}
              onClick={() => onSelect(t.code)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(t.code);
                }
              }}
              className="group flex h-full cursor-pointer flex-col"
            >
              <div className="flex items-start justify-between">
                <TypeAvatar mbtiType={t.code} size={56} />
                <GroupBadge mbtiType={t.code} size="sm" showLabel={false} />
              </div>
              <h3 className="mt-4 font-display text-lg font-bold text-brand-primary-950">
                {t.nickname}
                <span className="ml-2 font-mono text-sm font-medium text-neutral-400">{t.alias}</span>
              </h3>
              <p className="mt-1.5 flex-1 font-serif text-sm leading-relaxed text-neutral-600">{t.tagline}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold" style={{ color }}>
                了解更多
                <span className="transition-transform duration-normal ease-spring group-hover:translate-x-1">→</span>
              </span>
            </Card>
          </RevealItem>
        ))}
      </Reveal>
    </div>
  );
}

export default PersonalityTypes;