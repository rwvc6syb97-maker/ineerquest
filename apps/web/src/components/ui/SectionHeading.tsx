import type { ReactNode } from 'react';

/**
 * SectionHeading 区块标题
 * -------------------------------------------------------------
 * display 字体主标题 + 可选 serif 副标题/引导语 + 可选眉标（eyebrow）。
 * 支持左对齐 / 居中 / 非对称对齐（DESIGN_VARIANCE=7，鼓励打破居中默认）。
 */

export type HeadingAlign = 'left' | 'center' | 'asymmetric';

export interface SectionHeadingProps {
  /** 主标题（display 字体） */
  title: ReactNode;
  /** 眉标：标题上方的小号强调橙标记，用于分区导语 */
  eyebrow?: ReactNode;
  /** 副标题/引导语（serif 字体，内省语气） */
  subtitle?: ReactNode;
  /** 对齐方式，默认 left */
  align?: HeadingAlign;
  /** 主标题尺寸，默认 lg */
  size?: 'md' | 'lg' | 'xl';
  /** 语义标题级别，默认 h2 */
  as?: 'h1' | 'h2' | 'h3';
  /** 追加类名 */
  className?: string;
}

const ALIGN: Record<HeadingAlign, string> = {
  left: 'text-left items-start',
  center: 'text-center items-center mx-auto',
  // 非对称：左对齐但限定宽度并偏，制造视觉张力
  asymmetric: 'text-left items-start md:ml-[8%] max-w-2xl',
};

const TITLE_SIZE = {
  md: 'text-2xl md:text-3xl',
  lg: 'text-3xl md:text-4xl',
  xl: 'text-4xl md:text-5xl',
} as const;

export function SectionHeading({
  title,
  eyebrow,
  subtitle,
  align = 'left',
  size = 'lg',
  as = 'h2',
  className = '',
}: SectionHeadingProps) {
  const Tag = as;
  return (
    <div className={`flex flex-col gap-3 ${ALIGN[align]} ${className}`}>
      {eyebrow ? (
        <span className="font-sans text-sm font-semibold uppercase tracking-wider text-brand-accent-600">
          {eyebrow}
        </span>
      ) : null}
      <Tag
        className={`font-display font-bold leading-tight text-brand-primary-950 ${TITLE_SIZE[size]}`}
      >
        {title}
      </Tag>
      {subtitle ? (
        <p className="max-w-2xl font-serif text-lg leading-relaxed text-neutral-600">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export default SectionHeading;