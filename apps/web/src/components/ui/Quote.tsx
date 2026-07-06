import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Quote 引文块
 * -------------------------------------------------------------
 * serif 字体（Noto Serif SC）+ 左侧强调橙竖线的内省性文案容器。
 * 用于寄语、内省引导语、报告开场白等有情绪重量的文本。
 */

export interface QuoteProps extends HTMLAttributes<HTMLQuoteElement> {
  /** 引文正文 */
  children: ReactNode;
  /** 可选署名/出处 */
  cite?: ReactNode;
  /** 尺寸，默认 md */
  size?: 'md' | 'lg';
  /** 追加类名 */
  className?: string;
}

const SIZE = {
  md: 'text-lg',
  lg: 'text-2xl md:text-3xl',
} as const;

export function Quote({
  children,
  cite,
  size = 'md',
  className = '',
  ...rest
}: QuoteProps) {
  return (
    <blockquote
      className={`border-l-4 border-brand-accent-500 pl-5 font-serif italic text-neutral-700 ${SIZE[size]} ${className}`}
      {...rest}
    >
      <p className="leading-relaxed">{children}</p>
      {cite ? (
        <footer className="mt-3 font-sans text-sm not-italic text-neutral-500">
          — {cite}
        </footer>
      ) : null}
    </blockquote>
  );
}

export default Quote;