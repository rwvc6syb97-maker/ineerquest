/**
 * InnerQuest 设计令牌（THREE DIALS）
 * 品牌蓝 + 唯一强调橙 + 深蓝底；四族群色。
 * 供内联 style 使用，避免 tailwind 主题扩展依赖。
 */
export const COLORS = {
  brand: '#3b82f6',
  accent: '#f97316',
  deep: '#101a39',
  deepAlt: '#1e3a8a',
} as const;

/** 四族群色（NT/NF/SJ/SP） */
export const FAMILY_COLORS = {
  analyst: '#3b82f6', // NT 分析家
  diplomat: '#8b5cf6', // NF 外交家
  sentinel: '#22c55e', // SJ 守护者
  explorer: '#f97316', // SP 探险家
} as const;

export type Family = keyof typeof FAMILY_COLORS;

/** 根据 4 字母 MBTI 类型推导族群 */
export function familyOf(mbti: string): Family {
  const t = mbti.toUpperCase();
  const isN = t.includes('N');
  const isS = t.includes('S');
  if (isN && t.includes('T')) return 'analyst';
  if (isN && t.includes('F')) return 'diplomat';
  if (isS && t.includes('J')) return 'sentinel';
  return 'explorer';
}

/** 族群中文名 */
export const FAMILY_LABEL: Record<Family, string> = {
  analyst: '分析家 · NT',
  diplomat: '外交家 · NF',
  sentinel: '守护者 · SJ',
  explorer: '探险家 · SP',
};

/** 族群主题色取值 */
export function familyColor(family: Family): string {
  return FAMILY_COLORS[family];
}