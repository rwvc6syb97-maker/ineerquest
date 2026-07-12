/**
 * L-P0-3 追问式测评校准常量。
 * 纯规则判定，严禁引入 LLM；严禁触碰报告本体表。
 */

/**
 * 临界判定阈值：维度偏好百分比（0-100，越接近 50 越模糊）落在 [50, 55] 视为临界，
 * 需要追问式二次校准以确定该维度倾向。
 */
export const CALIBRATION_CRITICAL_MIN = 50;
export const CALIBRATION_CRITICAL_MAX = 55;

/** 维度键 → 中文两极追问文案（left=polarity1 字母极，right=polarity2 字母极）。 */
export const CALIBRATION_DIMENSION_META: Record<
  string,
  { dimension: number; letterFirst: string; letterSecond: string; question: string; optionFirst: string; optionSecond: string }
> = {
  EI: {
    dimension: 1,
    letterFirst: 'E',
    letterSecond: 'I',
    question: '在需要恢复精力时，你更倾向于哪种方式？',
    optionFirst: '与他人相处、参与社交活动（偏外向 E）',
    optionSecond: '独处、安静地待着（偏内向 I）',
  },
  SN: {
    dimension: 2,
    letterFirst: 'S',
    letterSecond: 'N',
    question: '面对新信息时，你更关注哪一面？',
    optionFirst: '具体的事实与细节（偏实感 S）',
    optionSecond: '背后的可能性与联系（偏直觉 N）',
  },
  TF: {
    dimension: 3,
    letterFirst: 'T',
    letterSecond: 'F',
    question: '做决定时，你更看重什么？',
    optionFirst: '逻辑与客观标准（偏思考 T）',
    optionSecond: '感受与人际和谐（偏情感 F）',
  },
  JP: {
    dimension: 4,
    letterFirst: 'J',
    letterSecond: 'P',
    question: '面对计划，你更喜欢哪种状态？',
    optionFirst: '提前安排、按计划推进（偏判断 J）',
    optionSecond: '保持灵活、随机应变（偏知觉 P）',
  },
};