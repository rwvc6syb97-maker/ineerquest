/**
 * P01 首页 Landing（精致化重构）
 * -------------------------------------------------------------
 * 设计硬约束落地：
 * - Hero：Split Screen 5:7 非对称分栏（左文案 / 右星图罗盘 SVG），
 *   禁「居中大字 + 居中双按钮 + 深色 mesh」的 AI 套路；首屏露出下方内容边缘。
 * - 区块交替布局：分屏 → 网格错落 → 深蓝分屏 → 居中终局 CTA，禁全站等宽三卡。
 * - 色彩：品牌蓝 + 唯一强调橙 CTA + 深蓝底（非纯黑）；四族群色。
 * - 动效三项：Hero 分层 fadeUp stagger + 区块 Reveal Scroll + CTA ease-spring（SpringButton）。
 *   全部经 prefers-reduced-motion 全局降级。
 */
import { useNavigate } from 'react-router-dom';
import { SpringButton, SpringLink } from '../../components/system/SpringButton';
import { Reveal, RevealItem, SectionHeading, StatPill, Quote, TiltCard } from '../../components';
import { FAMILY_COLORS, FAMILY_LABEL, type Family } from '../../theme/tokens';
import { HeroConstellation } from './HeroConstellation';

const FAMILIES: { key: Family; blurb: string; typeCount: string }[] = [
  { key: 'analyst', blurb: '理性、独立、追求精通，用系统思维洞察世界底层规律。', typeCount: 'INTJ · INTP · ENTJ · ENTP' },
  { key: 'diplomat', blurb: '共情、理想、心怀意义，以温暖与信念连接彼此。', typeCount: 'INFJ · INFP · ENFJ · ENFP' },
  { key: 'sentinel', blurb: '尽责、务实、恪守秩序，是组织与家庭里最坚实的后盾。', typeCount: 'ISTJ · ISFJ · ESTJ · ESFJ' },
  { key: 'explorer', blurb: '灵活、大胆、活在当下，用行动在真实世界里创造惊喜。', typeCount: 'ISTP · ISFP · ESTP · ESFP' },
];

const STATS = [
  { label: '已完成测评', value: '38.6万+' },
  { label: '用户满意度', value: '96%' },
  { label: '职业方向库', value: '120+' },
];

const STEPS =[
  { no: '01', title: '10 分钟深度测评', desc: '40 道基于四维认知的科学题目，还原真实的你。', span: 'md:col-span-3' },
  { no: '02', title: '可视化人格报告', desc: '四维度倾向条 + 优势盲点解读，看清自己的独特轮廓。', span: 'md:col-span-3' },
  { no: '03', title: '专属职业规划', desc: '基于人格优势匹配契合的职业方向与成长路径建议。', span: 'md:col-span-2' },
  { no: '04', title: '持续成长陪伴', desc: '结合报告的教练式提问，把洞察真正落到行动上。', span: 'md:col-span-4' },
];

export function HomePage() {
  const navigate = useNavigate();

  return (
    // 突破 PublicLayout 的 max-w-5xl 容器，营销页自管理全宽留白
    <div className="-mx-6 -my-8">
      {/* ============ Hero：Split Screen 5:7 非对称分栏 ============ */}
      <section className="relative overflow-hidden bg-white px-6 pb-20 pt-16 md:pb-28 md:pt-24">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 md:grid-cols-12">
          {/* 左侧文案区（5 列） */}
          <div className="md:col-span-5">
            <span
              className="inline-flex animate-fadeUp items-center gap-2 rounded-full border border-brand-primary-100 bg-brand-primary-50 px-3 py-1 text-sm font-semibold text-brand-primary-700"
              style={{ animationDelay: '0ms' }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: FAMILY_COLORS.explorer }} />
              向内求索 · InnerQuest
            </span>

            <h1
              className="mt-6 animate-fadeUp font-display text-5xl font-bold leading-[1.08] tracking-tight text-brand-primary-950 md:text-6xl"
              style={{ animationDelay: '80ms' }}
            >
              绘制你的
              <br />
              <span className="text-brand-primary-600">内心地形图</span>
            </h1>

            <p
              className="mt-6 max-w-md animate-fadeUp font-serif text-lg leading-relaxed text-neutral-600"
              style={{ animationDelay: '160ms' }}
            >
              每个人心里都藏着一片尚未勘探的地貌。基于 MBTI 的人格测评与职业规划，
              带你看清自己的山川脉络，把独特的人格优势，转化为清晰的人生方向。
            </p>

            <div
              className="mt-9 flex animate-fadeUp flex-wrap items-center gap-4"
              style={{ animationDelay: '240ms' }}
            >
              {/* 唯一强调橙 CTA */}
              <SpringButton variant="accent" className="px-7 py-3 text-base" onClick={() => navigate('/assessment')}>
                免费开始测评
              </SpringButton>
           <SpringLink to="/personality-types" variant="ghost" className="px-6 py-3 text-base">
                浏览 16 型人格
              </SpringLink>
            </div>

            <div
              className="mt-10 flex animate-fadeUp flex-wrap gap-3"
              style={{ animationDelay: '320ms' }}
            >
              {STATS.map((s) => (
                <StatPill key={s.label} label={s.label} value={s.value} tone="neutral" />
              ))}
            </div>
          </div>

          {/* 右侧视觉区（7 列）：抽象星图/罗盘/内心地形图 SVG */}
          <div
            className="animate-fadeUp md:col-span-7"
            style={{ animationDelay: '200ms' }}
          >
            <HeroConstellation />
          </div>
        </div>

        {/* 首屏底部露出下方内容边缘暗示可滚动 */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-4">
          <span className="animate-fadeUp text-xs font-medium tracking-widest text-neutral-400" style={{ animationDelay: '480ms' }}>
            向下滚动，开启探索 ↓
          </span>
        </div>
      </section>

      {/* ============ 探索旅程：网格错落（4 步，非等宽） ============ */}
      <section className="bg-neutral-50 px-6 py-20 md:py-24">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            align="asymmetric"
            eyebrow="EXPLORATION JOURNEY"
            title="四步，完成一次向内的探索"
            subtitle="从测评到行动，每一步都为你揭开一层更真实的自我。"
          />
          <Reveal className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-6" as="div">
            {STEPS.map((s, i) => (
              <RevealItem key={s.no} index={i} className={s.span}>
                <TiltCard className="h-full" maxTilt={7}>
                  <div className="font-display text-4xl font-bold text-brand-primary-200">{s.no}</div>
                  <h3 className="mt-4 font-display text-xl font-bold text-brand-primary-950">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600">{s.desc}</p>
                </TiltCard>
              </RevealItem>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ============ 四族群：深蓝分屏（左引文右族群列表） ============ */}
      <section
        className="px-6 py-20 md:py-24"
        style={{ background: `linear-gradient(140deg, #101a39, #1e3a8a)` }}
      >
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-12 md:grid-cols-12">
          <div className="md:col-span-4">
            <span className="font-sans text-sm font-semibold uppercase tracking-wider" style={{ color: FAMILY_COLORS.explorer }}>
              FOUR FAMILIES
            </span>
            <h2 className="mt-3 font-display text-4xl font-bold leading-tight text-white">
              你属于
              <br />
              哪一族群？
            </h2>
            <Quote className="mt-6 border-brand-accent-500 text-white/80" size="md">
              16 型人格归为四大族群，每一族都是一种看待世界的独特方式。
            </Quote>
            <SpringLink to="/personality-types" variant="accent" className="mt-8 px-6 py-3">
              查看全部 16 型
            </SpringLink>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:col-span-8">
            {FAMILIES.map((f) => (
              <div
                key={f.key}
                className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition-transform duration-normal ease-spring hover:-translate-y-1"
              >
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full" style={{ background: FAMILY_COLORS[f.key] }} />
                  <span className="font-display text-lg font-bold text-white">{FAMILY_LABEL[f.key]}</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-white/70">{f.blurb}</p>
                <p className="mt-4 font-mono text-xs tracking-wide text-white/40">{f.typeCount}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ 社会证明：拟真数据居中带 ============ */}
      <section className="border-y border-neutral-200 bg-white px-6 py-16">
        <Reveal className="mx-auto grid max-w-4xl grid-cols-2 gap-8 text-center md:grid-cols-4" as="div">
          {[
            { v: '38.6万+', l: '完成测评人数' },
            { v: '96%', l: '用户满意度' },
            { v: '4.8 / 5', l: '报告评分' },
            { v: '120+', l: '职业方向库' },
          ].map((s, i) => (
            <RevealItem key={s.l} index={i}>
              <div className="font-display text-3xl font-bold text-brand-primary-600 md:text-4xl">{s.v}</div>
              <div className="mt-1 text-sm text-neutral-500">{s.l}</div>
            </RevealItem>
          ))}
        </Reveal>
      </section>

      {/* ============ 终局 CTA：居中收束 ============ */}
      <section className="bg-neutral-50 px-6 py-24 text-center">
        <div className="mx-auto max-w-xl">
          <Quote className="mx-auto inline-block text-left" size="lg">
            认识自己，是一生中最值得的一次旅行。
          </Quote>
          <h2 className="mt-8 font-display text-3xl font-bold text-brand-primary-950 md:text-4xl">
            现在就出发，只需 10 分钟
          </h2>
          <p className="mt-3 text-neutral-600">首份人格报告完全免费，无需注册即可开始。</p>
          <SpringButton variant="accent" className="mt-8 px-8 py-3 text-base" onClick={() => navigate('/assessment')}>
            立即测评
          </SpringButton>
        </div>
      </section>
    </div>
  );
}