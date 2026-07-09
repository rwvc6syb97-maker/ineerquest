/**
 * 时间本地化工具
 * -------------------------------------------------------------
 * 后端下发的 completedAt 等时间为 ISO8601 UTC（带 Z），
 * 前端展示统一通过此工具转东八区（Asia/Shanghai）本地化字符串，
 * 禁止直接展示原始 UTC 字符串。
 */

const TZ = 'Asia/Shanghai';

/**
 * 将 ISO8601 UTC 时间字符串格式化为东八区日期时间展示串。
 * 入参无效/为空时返回空字符串（调用方自行判空兜底 UI 文案）。
 *
 * @param iso 形如 '2026-07-10T03:20:00Z' 的 ISO8601 UTC 字符串
 * @returns 形如 '2026/07/10 11:20' 的东八区展示串
 */
export function formatUtcToLocal(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * 仅展示东八区日期（不含时间）。
 *
 * @param iso ISO8601 UTC 字符串
 * @returns 形如 '2026/07/10' 的东八区日期串
 */
export function formatUtcToLocalDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}