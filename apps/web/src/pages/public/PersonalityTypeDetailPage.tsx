/**
 * P03 人格类型详情（/personality-types/:typeCode，公开）
 * -------------------------------------------------------------
 * useParams 取 typeCode → TYPE_MAP 查数据（查不到用 EmptyState 兜底）。
 * 分区：Hero（TypeAvatar 头图 + 族群徽章 + 主张/概述）→ 特质 → 优势/盲点
 *      → 四维度 → 职业倾向 → 名人案例 + 同族群 → 寄语 + 终局 CTA。
 * 复用 ReportPage 视觉范式（族群色氛围、SectionHeading 分段、GlassCard/Card）。
 */
import { useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Reveal,
  RevealItem,
  SectionHeading,
  Card,
  Tag,
  StatPill,
  Quote,
  TypeAvatar,
  GroupBadge,
  DimensionBar,
  EmptyState,
  SpringButton,
  SpringLink,
  BackButton,
} from '../../components';
import { FAMILY_COLORS, FAMILY_LABEL } from '../../theme/tokens';
import { TYPE_MAP, typesByFamily, type PersonalityType } from '../../data/personalityTypes';

export function PersonalityTypeDetailPage() {
  const { typeCode } = useParams<{ typeCode: string }>();
  const navigate = useNavigate();
  const code = (typeCode ?? '').toUpperCase();
  const type = useMemo<PersonalityType | undefined>(() => TYPE_MAP[code], [code]);

  if (!type) {
    return (
      <div className="py-16">
        <EmptyState
          title="未找到该人格类型"
          description={`类型码 “${typeCode}” 不在 16 型之列。回到总览挑一个看看吧。`}
          action={
            <SpringButton variant="primary" onClick={() => navigate('/personality-types')}>
              返回 16 型总览
            </SpringButton>
          }
        />
      </div>
    );
  }

  const color = FAMILY_COLORS[type.family];
  const siblings = typesByFamily(type.family).filter((t) => t.code !== type.code);
  const hasFamous = type.famous.length > 0;

  return (
    <div className="-mx-6 -my-8">
      {/* ============ Hero 分屏 ============ */}
      <section
        className="px-6 pb-16 pt-14"
        style={{ background: `linear-gradient(150deg, ${color}12, #ffffff 68%)` }}
      >
        {/* 返回上一级 */}
        <div className="mx-auto max-w-6xl">
          <BackButton to="/personality-types" label="返回 16 型总览" className="mb-3" />
        </div>
        {/* 面包屑 */}
        <nav className="mx-auto mb-8 flex max-w-6xl items-center gap-2 font-mono text-xs text-neutral-400">
          <Link to="/personality-types" className="transition-colors hover:text-neutral-700">
            16 型人格
          </Link>
          <span>/</span>
          <span style={{ color }}>{type.code}</span>
        </nav>

        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 md:grid-cols-12">
          {/* 左：意象头图 */}
          <div className="flex justify-center md:col-span-5 md:justify-start">
            <div className="animate-fadeUp rounded-3xl p-8" style={{ background: `${color}0f` }}>
              <TypeAvatar mbtiType={type.code} size={220} />
            </div>
          </div>

          {/* 右：文案 */}
          <div className="md:col-span-7">
            <div className="animate-fadeUp" style={{ animationDelay: '80ms' }}>
              <GroupBadge mbtiType={type.code} size="md" />
            </div>
            <h1
              className="mt-5 animate-fadeUp font-display text-4xl font-bold leading-tight text-brand-primary-950 md:text-5xl"
              style={{ animationDelay: '140ms' }}
            >
              {type.nickname}
              <span className="ml-3 font-mono text-2xl font-medium text-neutral-400">{type.code}</span>
            </h1>
            <p
              className="mt-3 animate-fadeUp font-serif text-xl leading-relaxed text-neutral-700"
              style={{ animationDelay: '200ms' }}
            >
              {type.tagline}
            </p>
            <p
              className="mt-4 animate-fadeUp text-base leading-relaxed text-neutral-600"
              style={{ animationDelay: '260ms' }}
            >
              {type.overview}
            </p>
            <div
              className="mt-6 flex animate-fadeUp flex-wrap items-center gap-3"
              style={{ animationDelay: '320ms' }}
            >
              <StatPill label="人群占比" value={type.population} color={color} />
              <span className="font-mono text-sm text-neutral-400">{FAMILY_LABEL[type.family]}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============ 开篇特质（Quote） ============ */}
      <section className="bg-white px-6 pt-16">
        <div className="mx-auto max-w-3xl">
          <Quote size="lg">{type.quote}</Quote>
        </div>
      </section>

      {/* ============ 核心特质 ============ */}
      <section className="bg-white px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            size="md"
            eyebrow="CORE TRAITS"
            title="标志性特质"
            subtitle="这些关键词勾勒出这一型最鲜明的认知与行为底色。"
          />
          <Reveal className="mt-6 flex flex-wrap gap-2.5">
            {type.traits.map((t, i) => (
              <RevealItem key={t} index={i} as="span">
                <Tag color={color} size="md">
                  {t}
                </Tag>
              </RevealItem>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ============ 优势 / 盲点（非对称双栏） ============ */}
      <section className="bg-neutral-50 px-6 py-16">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-5">
          <Card padding="lg" className="md:col-span-3">
            <h3 className="flex items-center gap-2 font-display text-xl font-bold text-brand-primary-950">
              <span className="h-5 w-1.5 rounded-full" style={{ background: color }} />
              天赋优势
            </h3>
            <ul className="mt-5 space-y-3">
              {type.strengths.map((s) => (
                <li key={s} className="flex gap-3 text-neutral-700">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="leading-relaxed">{s}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card padding="lg" className="md:col-span-2">
            <h3 className="flex items-center gap-2 font-display text-xl font-bold text-brand-primary-950">
              <span className="h-5 w-1.5 rounded-full bg-neutral-300" />
              潜在盲点
            </h3>
            <ul className="mt-5 space-y-3">
              {type.weaknesses.map((w) => (
                <li key={w} className="flex gap-3 text-neutral-600">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400" />
                  <span className="leading-relaxed">{w}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      {/* ============ 四维度 ============ */}
      <section className="bg-white px-6 py-16">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-10 md:grid-cols-12">
          <div className="md:col-span-4">
            <SectionHeading
              size="md"
              eyebrow="DIMENSIONS"
              title="四维度倾向"
              subtitle="每一维都是一段光谱，而非非此即彼的开关。"
            />
          </div>
          <div className="md:col-span-8">
            <Reveal className="space-y-6">
              {type.dimensions.map((d) => (
                <DimensionBar
                  key={d.label}
                  label={d.label}
                  leftPole={d.leftPole}
                  rightPole={d.rightPole}
                  value={d.value}
                  dimensionColor={color}
                />
              ))}
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============ 职业倾向 ============ */}
      <section className="bg-neutral-50 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            size="md"
            eyebrow="CAREER FIT"
            title="适配的职业方向"
            subtitle="基于认知偏好的匹配度参考，而非天花板——方向比标签更重要。"
          />
          <Reveal className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {type.careers.map((c, i) => (
              <RevealItem key={c.title} index={i}>
                <Card padding="md" className="flex items-center justify-between">
                  <span className="font-display font-semibold text-brand-primary-950">{c.title}</span>
                  <StatPill label="匹配" value={`${c.match}%`} color={color} />
                </Card>
              </RevealItem>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ============ 名人案例 + 同族群 ============ */}
      <section className="bg-white px-6 py-16">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 md:grid-cols-12">
          <div className="md:col-span-6">
            <SectionHeading size="md" eyebrow="LIKE-MINDED" title="与你同型的人" />
            {hasFamous ? (
              <div className="mt-5 flex flex-wrap gap-2.5">
                {type.famous.map((name) => (
                  <Tag key={name} tone="neutral" size="md">
                    {name}
                  </Tag>
                ))}
              </div>
            ) : (
              <p className="mt-5 font-serif text-sm text-neutral-500">名人案例整理中，敬请期待。</p>
            )}
          </div>
          <div className="md:col-span-6">
            <SectionHeading size="md" eyebrow={FAMILY_LABEL[type.family]} title="同族群的其它类型" />
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {siblings.map((s) => (
                <Link
                  key={s.code}
                  to={`/personality-types/${s.code}`}
                  className="group flex items-center gap-3 rounded-2xl border border-neutral-200/70 bg-white p-3 shadow-sm transition-transform duration-normal ease-spring hover:-translate-y-0.5 hover:shadow-md"
                >
                  <TypeAvatar mbtiType={s.code} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate font-display text-sm font-semibold text-brand-primary-950">
                      {s.nickname}
                    </span>
                    <span className="font-mono text-xs text-neutral-400">{s.code}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============ 终局 CTA ============ */}
      <section className="bg-neutral-50 px-6 py-20">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <h2 className="font-display text-2xl font-bold text-brand-primary-950 md:text-3xl">
            这只是关于「{type.nickname}」的一瞥
          </h2>
          <p className="mt-3 font-serif text-lg text-neutral-600">
            完成完整测评，看看你究竟是哪一型，以及为什么。
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <SpringButton variant="accent" onClick={() => navigate('/assessment')}>
              去做测评
            </SpringButton>
            <SpringLink to="/personality-types" variant="ghost">
              查看职业匹配
            </SpringLink>
          </div>
        </div>
      </section>
    </div>
  );
}

export default PersonalityTypeDetailPage;