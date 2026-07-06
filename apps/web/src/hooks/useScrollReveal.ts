import { useEffect } from 'react';

/**
 * useScrollReveal
 * -------------------------------------------------------------
 * 基于 IntersectionObserver 的一次性滚动揭示 Hook。
 *
 * - 对页面内所有 `[data-reveal]` 元素观测，命中视口 threshold=0.15 时
 *   添加 `is-revealed` class，并立即 unobserve（一次性）。
 * - SSR 安全：非浏览器环境（无 window / IntersectionObserver）直接返回。
 * - prefers-reduced-motion：直接标记所有元素为 revealed，不做动效。
 *
 * @param deps 依赖数组，路由/内容变化时可重新扫描 DOM（默认空数组，仅挂载时执行）。
 */
export function useScrollReveal(deps: ReadonlyArray<unknown> = []): void {
  useEffect(() => {
    // SSR / 非浏览器环境保护
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const elements = Array.from(
      document.querySelectorAll<HTMLElement>('[data-reveal]'),
    );

    if (elements.length === 0) {
      return;
    }

    // reduced-motion：直接揭示，跳过观测
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || typeof IntersectionObserver === 'undefined') {
      elements.forEach((el) => el.classList.add('is-revealed'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 },
    );

    elements.forEach((el) => {
      // 已揭示过的元素跳过重复观测
      if (!el.classList.contains('is-revealed')) {
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export default useScrollReveal;