import type { ReactNode } from 'react';

interface DocSection {
  heading: string;
  body: ReactNode;
}

interface DocPageProps {
  title: string;
  subtitle?: string;
  updatedAt?: string;
  sections: DocSection[];
}

// 信息类文档页壳（隐私 / 协议 / 关于），浅底、清晰排版，低视觉密度
export function DocPage({ title, subtitle, updatedAt, sections }: DocPageProps) {
  return (
    <article className="mx-auto max-w-3xl">
      <header className="border-b border-slate-200 pb-6">
        <h1 className="text-3xl font-bold" style={{ color: '#101a39' }}>
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-slate-500">{subtitle}</p>}
        {updatedAt && (
          <p className="mt-2 text-xs text-slate-400">最近更新：{updatedAt}</p>
        )}
      </header>
      <div className="mt-8 space-y-8">
        {sections.map((s) => (
          <section key={s.heading}>
            <h2 className="text-lg font-semibold" style={{ color: '#1e3a8a' }}>
              {s.heading}
            </h2>
            <div className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</div>
          </section>
        ))}
      </div>
    </article>
  );
}