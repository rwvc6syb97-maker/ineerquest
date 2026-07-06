import type { ReactNode } from 'react';

interface SystemPageProps {
  code?: string;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  tone?: 'dark' | 'light';
}

// 系统状态页壳：错误/兜底类用深蓝底（#101a39→#1e3a8a 渐变，非纯黑、非 mesh、非玻璃拟态）
// 信息类页面用浅底。所有装饰保持低视觉密度（VISUAL_DENSITY 4）。
export function SystemPage({
  code,
  title,
  description,
  actions,
  tone = 'dark',
}: SystemPageProps) {
  const isDark = tone === 'dark';
  return (
    <div
      className="flex min-h-[70vh] w-full flex-col items-center justify-center px-6 py-16 text-center"
      style={
        isDark
          ? { background: 'linear-gradient(160deg, #101a39 0%, #1e3a8a 100%)' }
          : undefined
      }
    >
      {code && (
        <span
          className="mb-4 font-extrabold tracking-tight"
          style={{
            fontSize: 'clamp(3.5rem, 12vw, 6rem)',
            lineHeight: 1,
            color: isDark ? '#f97316' : '#3b82f6',
          }}
        >
          {code}
        </span>
      )}
      <h1
        className="text-2xl font-semibold sm:text-3xl"
        style={{ color: isDark ? '#ffffff' : '#0f172a' }}
      >
        {title}
      </h1>
      <div
        className="mt-3 max-w-md text-sm leading-relaxed sm:text-base"
        style={{ color: isDark ? 'rgba(226,232,240,0.82)' : '#475569' }}
      >
        {description}
      </div>
      {actions && (
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}