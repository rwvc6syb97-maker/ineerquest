/**
 * 报告内容构建器（纯函数，不依赖 Prisma/LLM，便于 jest 单测）。
 * 免费预览段落全部由 MBTI 类型 + 维度得分静态生成；深度段落走占位/兜底。
 */
import {
  DEEP_SECTION_FALLBACK,
  DEFAULT_MBTI_PROFILE,
  DIMENSION_LABELS,
  MBTI_PROFILES,
  PAID_SECTION_KEYS,
  SectionKey,
} from './report.constants';

export interface DimensionScores {
  EI: number;
  SN: number;
  TF: number;
  JP: number;
}

export interface BuiltSection {
  sectionKey: string;
  title: string;
  content: Record<string, unknown>;
  sortOrder: number;
  /** 是否付费段落（未解锁不可见）。 */
  paid: boolean;
}

/** 取指定类型的静态 profile，未知类型回落兜底。 */
export function getProfile(mbtiType: string) {
  return MBTI_PROFILES[mbtiType?.toUpperCase?.()] ?? DEFAULT_MBTI_PROFILE;
}

/**
 * 依据某维度得分（0~100，代表偏向 first 极的百分比）生成可读描述。
 * >50 偏 first 极，<50 偏 second 极，=50 平衡。
 */
export function describeDimension(
  key: 'EI' | 'SN' | 'TF' | 'JP',
  score: number,
): { title: string; leaning: string; percent: number } {
  const label = DIMENSION_LABELS[key];
  const pct = Math.round(Math.max(0, Math.min(100, score)));
  let leaning: string;
  if (pct > 50) leaning = label.first;
  else if (pct < 50) leaning = label.second;
  else leaning = `${label.first} / ${label.second} 平衡`;
  return { title: label.title, leaning, percent: pct };
}

/**
 * 构建全部报告段落（免费预览 + 付费占位）。
 * @param llmDeepText 若 LLM 可用则传入生成文本，否则走兜底占位。
 */
export function buildSections(
  mbtiType: string,
  scores: DimensionScores,
  llmDeepText?: Partial<Record<string, string>>,
): BuiltSection[] {
  const profile = getProfile(mbtiType);
  const sections: BuiltSection[] = [];

  // 1) 类型概述（免费）
  sections.push({
    sectionKey: SectionKey.TYPE_OVERVIEW,
    title: `${mbtiType} · ${profile.nickname}`,
    content: { mbtiType, nickname: profile.nickname, overview: profile.overview },
    sortOrder: 1,
    paid: false,
  });

  // 2) 维度得分（免费）
  const dims = (['EI', 'SN', 'TF', 'JP'] as const).map((k) => ({
    dimension: k,
    ...describeDimension(k, scores[k]),
  }));
  sections.push({
    sectionKey: SectionKey.DIMENSION_SCORES,
    title: '四维度得分',
    content: { dimensions: dims },
    sortOrder: 2,
    paid: false,
  });

  // 3) 性格优势（免费简版）
  sections.push({
    sectionKey: SectionKey.STRENGTHS,
    title: '你的核心优势',
    content: { strengths: profile.strengths },
    sortOrder: 3,
    paid: false,
  });

  // 4~6) 付费深度段落：LLM 可用取文本，否则兜底占位
  const paidTitles: Record<string, string> = {
    [SectionKey.DEEP_PERSONALITY]: '深度性格解读',
    [SectionKey.CAREER_ADVICE]: '职业发展建议',
    [SectionKey.RELATIONSHIP]: '人际关系解读',
  };
  let order = 4;
  for (const key of PAID_SECTION_KEYS) {
    const text = llmDeepText?.[key];
    sections.push({
      sectionKey: key,
      title: paidTitles[key] ?? key,
      content: {
        text: text && text.trim() ? text : DEEP_SECTION_FALLBACK,
        fallback: !(text && text.trim()),
      },
      sortOrder: order++,
      paid: true,
    });
  }

  return sections;
}