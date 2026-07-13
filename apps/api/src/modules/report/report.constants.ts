/**
 * 报告体系常量 —— 纯规则内容，严禁引入任何 LLM 依赖（T1-14 基础报告硬要求）。
 * MBTI 16 型描述、维度文案、报告章节 key、配额、解锁等。
 */

/** 报告类型（report.report_type）。 */
export const ReportType = {
  /** 免费基础报告 */
  BASIC: 1,
  /** 付费深度报告 */
  DEEP: 2,
} as const;

/** 报告状态（report.status）。 */
export const ReportStatus = {
  GENERATING: 0,
  READY: 1,
  FAILED: 2,
} as const;

/** 契约 v2.1 概览出参 generateStatus 字符串枚举。 */
export type GenerateStatus = 'pending' | 'generating' | 'done' | 'failed';

/**
 * report.status 数字 → 契约 generateStatus 字符串映射（PM v2.1 §6.2①）。
 * GENERATING→generating、READY→done、FAILED→failed；已创建未触发深度→pending（由业务判定后覆盖）。
 */
export function mapGenerateStatus(status: number): GenerateStatus {
  switch (status) {
    case ReportStatus.GENERATING:
      return 'generating';
    case ReportStatus.READY:
      return 'done';
    case ReportStatus.FAILED:
      return 'failed';
    default:
      return 'pending';
  }
}

/**
 * 概览 generateStatus 终态优先判定（纯函数，供 buildReportOverview 复用与单测）。
 *
 * 语义（与 BUG8 主链路终态自洽）：
 * 1. FAILED 是终态：优先于付费段判定直接返回 'failed'。
 *    全降级场景下 report.status 已被主链路置为 FAILED，但付费段 content.fallback 恒 true
 *    会使 hasGeneratedPaidSection=false，若不优先判定终态则会被误覆盖为 'pending' 造成概览轮询死循环。
 * 2. 非终态（GENERATING/未触发）：仅当付费段已实际生成(content.fallback===false)才走 mapGenerateStatus，
 *    否则保持 'pending'，避免 GENERATING 中途被误判为已完成。
 * 3. READY：付费段已实际生成 → mapGenerateStatus(READY)='done'，维持原判定不变。
 *
 * @param status report.status 数字状态
 * @param hasGeneratedPaidSection 是否存在 content.fallback===false 的付费段
 */
export function resolveGenerateStatus(status: number, hasGeneratedPaidSection: boolean): GenerateStatus {
  if (status === ReportStatus.FAILED) {
    return 'failed';
  }
  return hasGeneratedPaidSection ? mapGenerateStatus(status) : 'pending';
}

/** MBTI 家族（性格四大类），由 mbtiType 推导，前端不得反解（PM v2.1）。 */
export type MbtiFamily = 'analyst' | 'diplomat' | 'sentinel' | 'explorer';

/**
 * 由 4 字母 MBTI 类型推导家族：
 * NT=分析家 analyst；NF=外交家 diplomat；SJ=守护者 sentinel；SP=探险家 explorer。
 */
export function deriveFamily(mbtiType: string): MbtiFamily {
  const t = (mbtiType ?? '').toUpperCase();
  const hasN = t.includes('N');
  const hasS = t.includes('S');
  const hasT = t.includes('T');
  const hasF = t.includes('F');
  const hasJ = t.includes('J');
  const hasP = t.includes('P');
  if (hasN && hasT) return 'analyst';
  if (hasN && hasF) return 'diplomat';
  if (hasS && hasJ) return 'sentinel';
  if (hasS && hasP) return 'explorer';
  return 'explorer';
}

/**
 * 契约 dimensions 固定 4 项两极标签（left=偏向低分极，right=偏向高分极）。
 * score 采用 assessment_result 中该维度得分（0~100，代表偏向 right 极的百分比）。
 */
export const DIMENSION_POLES: Array<{
  dimension: 'EI' | 'SN' | 'TF' | 'JP';
  left: string;
  right: string;
}> = [
  { dimension: 'EI', left: '内向 I', right: '外向 E' },
  { dimension: 'SN', left: '实感 S', right: '直觉 N' },
  { dimension: 'TF', left: '思考 T', right: '情感 F' },
  { dimension: 'JP', left: '判断 J', right: '知觉 P' },
];

/** 报告章节 key（report_section.section_key）。 */
export const SectionKey = {
  /** 类型概述（免费预览） */
  TYPE_OVERVIEW: 'type_overview',
  /** 维度得分（免费预览） */
  DIMENSION_SCORES: 'dimension_scores',
  /** 性格优势（免费预览简版） */
  STRENGTHS: 'strengths',
  /** 深度性格解读（付费，走 LLM） */
  DEEP_PERSONALITY: 'deep_personality',
  /** 职业发展建议（付费，走 LLM） */
  CAREER_ADVICE: 'career_advice',
  /** 人际关系解读（付费，走 LLM） */
  RELATIONSHIP: 'relationship',
} as const;

/** 免费预览可见的章节 key 集合（未解锁时仅返回这些）。 */
export const PREVIEW_SECTION_KEYS: string[] = [
  SectionKey.TYPE_OVERVIEW,
  SectionKey.DIMENSION_SCORES,
  SectionKey.STRENGTHS,
];

/** 付费（需解锁）章节 key 集合。 */
export const PAID_SECTION_KEYS: string[] = [
  SectionKey.DEEP_PERSONALITY,
  SectionKey.CAREER_ADVICE,
  SectionKey.RELATIONSHIP,
];

/** 每日报告生成配额（份/人/天）。 */
export const REPORT_DAILY_QUOTA = 3;

/** Redis 日配额计数器前缀。 */
export const REPORT_QUOTA_REDIS_PREFIX = 'report:quota:';

/** 深度解读段 LLM 不可用时的兜底占位文案。 */
export const DEEP_SECTION_FALLBACK =
  '深度解读正在生成中，请稍后刷新查看。（当前为占位文案，AI 深度解读服务恢复后将自动补全）';

/** 维度两极文案（用于维度得分章节）。 */
export const DIMENSION_LABELS: Record<
  'EI' | 'SN' | 'TF' | 'JP',
  { first: string; second: string; title: string }
> = {
  EI: { first: '外向 E', second: '内向 I', title: '精力来源' },
  SN: { first: '实感 S', second: '直觉 N', title: '信息获取' },
  TF: { first: '思考 T', second: '情感 F', title: '决策方式' },
  JP: { first: '判断 J', second: '知觉 P', title: '生活态度' },
};

/** 16 型基础描述（概述 + 优势），纯静态内容。 */
export interface MbtiProfile {
  nickname: string;
  overview: string;
  strengths: string[];
}

export const MBTI_PROFILES: Record<string, MbtiProfile> = {
  INTJ: { nickname: '建筑师', overview: '富有想象力和战略性的思想家，凡事都有计划。', strengths: ['战略思维', '独立自主', '目标坚定'] },
  INTP: { nickname: '逻辑学家', overview: '具有创造力的发明家，对知识有着止不住的渴望。', strengths: ['逻辑分析', '客观理性', '创新思考'] },
  ENTJ: { nickname: '指挥官', overview: '大胆、富有想象力、意志强大的领导者。', strengths: ['领导决断', '高效执行', '战略规划'] },
  ENTP: { nickname: '辩论家', overview: '聪明好奇的思想者，无法抗拒智力上的挑战。', strengths: ['思维敏捷', '善于辩论', '适应力强'] },
  INFJ: { nickname: '提倡者', overview: '安静而神秘，同时鼓舞人心且不知疲倦的理想主义者。', strengths: ['富有洞察', '坚定信念', '利他关怀'] },
  INFP: { nickname: '调停者', overview: '诗意善良的利他主义者，总是热衷于帮助正义事业。', strengths: ['价值驱动', '共情能力', '创造表达'] },
  ENFJ: { nickname: '主人公', overview: '富有魅力、鼓舞人心的领导者，能使听众为之倾倒。', strengths: ['感召他人', '沟通协调', '同理心强'] },
  ENFP: { nickname: '竞选者', overview: '热情洋溢、富有创造力的自由灵魂，总能找到微笑的理由。', strengths: ['热情感染', '创意丰富', '善于连接'] },
  ISTJ: { nickname: '物流师', overview: '务实、注重事实的可靠之人，其可靠性不容置疑。', strengths: ['尽职尽责', '注重细节', '踏实可靠'] },
  ISFJ: { nickname: '守卫者', overview: '非常专注而温暖的守护者，时刻准备保护爱着的人。', strengths: ['体贴周到', '忠诚可靠', '务实耐心'] },
  ESTJ: { nickname: '总经理', overview: '出色的管理者，在管理事务或人员方面无与伦比。', strengths: ['组织管理', '执行有力', '责任感强'] },
  ESFJ: { nickname: '执政官', overview: '极有同情心、爱交往受欢迎的人，总是热心帮助他人。', strengths: ['乐于助人', '协作意识', '尽心尽责'] },
  ISTP: { nickname: '鉴赏家', overview: '大胆而实际的实验家，擅长使用各种工具。', strengths: ['动手能力', '冷静应变', '务实高效'] },
  ISFP: { nickname: '探险家', overview: '灵活有魅力的艺术家，时刻准备探索和体验新鲜事物。', strengths: ['审美敏锐', '灵活随和', '感受细腻'] },
  ESTP: { nickname: '企业家', overview: '聪明、精力充沛、善于感知的人，真心享受生活在边缘。', strengths: ['行动力强', '临场应变', '现实敏锐'] },
  ESFP: { nickname: '表演者', overview: '自发、精力充沛而热情的表演者，生活在他们周围绝不无聊。', strengths: ['活力四射', '善于社交', '乐观积极'] },
};

/** 兜底 profile（异常/未知类型时使用）。 */
export const DEFAULT_MBTI_PROFILE: MbtiProfile = {
  nickname: '探索者',
  overview: '你的 MBTI 类型描述正在完善中。',
  strengths: ['自我觉察', '持续成长'],
};

/** 分享码字符表（去除易混淆字符）。 */
export const SHARE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';