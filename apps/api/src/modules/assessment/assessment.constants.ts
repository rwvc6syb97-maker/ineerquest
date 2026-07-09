/**
 * 测评体系常量（对齐 prisma schema：assessment_question / assessment_option / assessment_record / assessment_result）
 * 纯规则计分基础定义，严禁引入任何 LLM 依赖。
 */

/** 题目/选项维度（assessment_question.dimension、assessment_option 归属维度）。 */
export const Dimension = {
  EI: 1,
  SN: 2,
  TF: 3,
  JP: 4,
} as const;
export type DimensionValue = (typeof Dimension)[keyof typeof Dimension];

/** 维度键（用于题库分组返回与分值累加）。 */
export const DimensionKey = {
  [Dimension.EI]: 'EI',
  [Dimension.SN]: 'SN',
  [Dimension.TF]: 'TF',
  [Dimension.JP]: 'JP',
} as const;

/**
 * 选项极性（assessment_option.polarity）：
 * 每个维度有正反两极，polarity=1 指向该维度的第一个字母（E/S/T/J），
 * polarity=2 指向第二个字母（I/N/F/P）。
 */
export const Polarity = {
  FIRST: 1,
  SECOND: 2,
} as const;

/** 各维度两极字母：[polarity=1 字母, polarity=2 字母]。 */
export const DIMENSION_POLES: Record<number, [string, string]> = {
  [Dimension.EI]: ['E', 'I'],
  [Dimension.SN]: ['S', 'N'],
  [Dimension.TF]: ['T', 'F'],
  [Dimension.JP]: ['J', 'P'],
};

/** 4 字母组合的位序（拼装 MBTI 类型字符串时按此顺序）。 */
export const MBTI_DIMENSION_ORDER: number[] = [
  Dimension.EI,
  Dimension.SN,
  Dimension.TF,
  Dimension.JP,
];

/** 测评记录状态（assessment_record.status）。 */
export const RecordStatus = {
  /** 进行中（草稿/断点续答） */
  IN_PROGRESS: 1,
  /** 已提交（已计分出结果） */
  SUBMITTED: 2,
  /** 已废弃 */
  ABANDONED: 3,
} as const;

/** 题目/记录默认版本。 */
export const DEFAULT_QUESTION_VERSION = 'v2';

/**
 * 16 型分组（assessment_result.type_group）——按 MBTI 四大气质分组：
 * 分析家(NT)=1、外交家(NF)=2、守护者(SJ)=3、探索家(SP)=4。
 */
export const TypeGroup = {
  ANALYST: 1,
  DIPLOMAT: 2,
  SENTINEL: 3,
  EXPLORER: 4,
} as const;

/** 全部合法 16 型。 */
export const MBTI_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
] as const;

/** Redis 草稿 key 前缀与 TTL（断点续答缓存）。 */
export const DRAFT_REDIS_PREFIX = 'assessment:draft:';
export const DRAFT_REDIS_TTL_SEC = 60 * 60 * 24 * 7; // 7 天

/**
 * 结果查询维度两极标签（契约 v2.2 P1）：结构对齐报告概览 ReportOverview.dimensions。
 * left=偏向低分极，right=偏向高分极；score 取 assessment_result 各维度得分（0~100）。
 */
export const ASSESSMENT_DIMENSION_POLES: Array<{
  dimension: 'EI' | 'SN' | 'TF' | 'JP';
  left: string;
  right: string;
}> = [
  { dimension: 'EI', left: '内向 I', right: '外向 E' },
  { dimension: 'SN', left: '实感 S', right: '直觉 N' },
  { dimension: 'TF', left: '思考 T', right: '情感 F' },
  { dimension: 'JP', left: '判断 J', right: '知觉 P' },
];