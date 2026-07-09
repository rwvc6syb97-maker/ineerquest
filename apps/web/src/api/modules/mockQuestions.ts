/**
 * 前端 Mock 题库（v2 · 李克特 5 点量表 + 反向题，与后端 prisma/seed.ts 完全同源）
 * -------------------------------------------------------------
 * 用于无后端 / Mock 登录模式下的完整测评链路兜底。
 *
 * 结构约定（与真实接口 Question 一致）：
 *  - 每题一句陈述，pole 表示"同意"时指向的极性：1=第一极(E/S/T/J)，2=第二极(I/N/F/P)。
 *  - 每题 5 个李克特选项，label 为 非常不同意/不同意/中立/同意/非常同意。
 *  - option.value 同时编码 polarity 与 score：value = polarity * 10 + score
 *      例：21 → polarity=2,score=1；12 → polarity=1,score=2；中立记 0（score=0 不计）。
 *    store.answers[questionId] 存 value，本地评分 localScore 解码 value 得到 polarity/score，
 *    与后端「按所选 option.polarity 累加 option.score」的模型完全一致。
 *  - Question.dimension: 'EI' | 'SN' | 'TF' | 'JP'
 *
 * 李克特对称权重（正向题 pole=1）：
 *   非常不同意→(pol2,score2)=22、不同意→(pol2,score1)=21、中立→0、
 *   同意→(pol1,score1)=11、非常同意→(pol1,score2)=12
 * 反向题(pole=2)整体翻转极性。isReverse 仅语义标注，不做二次翻转。
 */
import type { Question, Dimension } from './assessment.api';

/** 5 档李克特文案（与后端 LIKERT_LABELS 顺序一致） */
export const LIKERT_LABELS = ['非常不同意', '不同意', '中立', '同意', '非常同意'] as const;

/** 正向题各档 (polarity, score)，与后端 FORWARD_MAP 完全一致。 */
const FORWARD_MAP: { polarity: number; score: number }[] = [
  { polarity: 2, score: 2 }, // 非常不同意
  { polarity: 2, score: 1 }, // 不同意
  { polarity: 1, score: 0 }, // 中立（不计）
  { polarity: 1, score: 1 }, // 同意
  { polarity: 1, score: 2 }, // 非常同意
];

/** value 编码：polarity*10+score；中立(score=0)→0。 */
export function encodeValue(polarity: number, score: number): number {
  return score === 0 ? 0 : polarity * 10 + score;
}

/** 解码 value → { polarity, score }；0 视为中立(score=0)。 */
export function decodeValue(value: number): { polarity: number; score: number } {
  if (!value) return { polarity: 0, score: 0 };
  return { polarity: Math.floor(value / 10), score: value % 10 };
}

/** 内部题目定义：题干陈述 + 同意所指极性 pole(1/2) */
interface Item {
  content: string;
  pole: 1 | 2;
}

const EI: Item[] = [
  { content: '我喜欢约上朋友外出聚会、参加热闹的活动。', pole: 1 },
  { content: '在陌生的社交场合，我会主动上前认识新朋友。', pole: 1 },
  { content: '与人聊天互动能让我快速恢复精力。', pole: 1 },
  { content: '讨论问题时，我习惯一边说一边理清思路。', pole: 1 },
  { content: '我更享受开放协作、频繁交流的工作节奏。', pole: 1 },
  { content: '别人常形容我热情外向、好相处。', pole: 1 },
  { content: '面对新想法，我更愿意立刻找人讨论。', pole: 1 },
  { content: '长时间独处会让我感到无聊、想找人。', pole: 1 },
  { content: '我更倾向待在家里独处、做点安静的事。', pole: 2 },
  { content: '我通常先在心里想清楚再开口。', pole: 2 },
];

const SN: Item[] = [
  { content: '接收信息时，我更关注具体的事实与细节。', pole: 1 },
  { content: '我更信任亲身经验与已被验证的做法。', pole: 1 },
  { content: '学习新东西时，我偏好按部就班、循序渐进。', pole: 1 },
  { content: '我更容易被实用、能马上落地的方案吸引。', pole: 1 },
  { content: '描述一件事时，我倾向如实还原发生了什么。', pole: 1 },
  { content: '我做事更看重当下的现实条件。', pole: 1 },
  { content: '别人说我是个脚踏实地的现实派。', pole: 1 },
  { content: '我更关注信息背后的含义与各种可能性。', pole: 2 },
  { content: '我更愿意从理想蓝图倒推来规划未来。', pole: 2 },
  { content: '读一本书，我更留意它的主题与深层寓意。', pole: 2 },
];

const TF: Item[] = [
  { content: '做决定时，我更看重客观逻辑与公平。', pole: 1 },
  { content: '评价一件事，我先问它是否合理、正确。', pole: 1 },
  { content: '与人意见冲突时，我倾向就事论事、坚持道理。', pole: 1 },
  { content: '给别人反馈时，我更可能直接指出问题。', pole: 1 },
  { content: '我更希望被认可为有能力、讲道理的人。', pole: 1 },
  { content: '我认为好的决策应该不受情绪干扰。', pole: 1 },
  { content: '别人形容我更像理性冷静的分析者。', pole: 1 },
  { content: '做决定时，我更看重他人的感受与和谐。', pole: 2 },
  { content: '面对朋友诉苦，我第一反应是先共情、陪他感受。', pole: 2 },
  { content: '分配任务时，我会优先照顾每个人的意愿与感受。', pole: 2 },
];

const JP: Item[] = [
  { content: '面对一天的安排，我喜欢提前列好计划、按表推进。', pole: 1 },
  { content: '对待截止日期，我通常早早完成、留出余量。', pole: 1 },
  { content: '我的生活空间倾向井井有条、物归原位。', pole: 1 },
  { content: '事情没定下来时，我会感到不安、想尽快敲定。', pole: 1 },
  { content: '出行旅游，我偏好有明确的行程和攻略。', pole: 1 },
  { content: '我更享受把事情一件件完成的状态。', pole: 1 },
  { content: '别人眼中的我更像有条理、靠谱的执行者。', pole: 1 },
  { content: '我更喜欢随机应变、看情况再决定。', pole: 2 },
  { content: '做选择时，我更希望多留些选项、保持开放。', pole: 2 },
  { content: '计划被打乱时，我更容易顺其自然、快速调整。', pole: 2 },
];

/** 维度分组（保持 EI→SN→TF→JP 顺序，与后端一致） */
const GROUPS: { dim: Dimension; items: Item[] }[] = [
  { dim: 'EI', items: EI },
  { dim: 'SN', items: SN },
  { dim: 'TF', items: TF },
  { dim: 'JP', items: JP },
];

/** 由 pole 生成 5 个李克特选项（pole=2 时整体翻转极性）。 */
function buildOptions(
  pole: 1 | 2,
): { id: string; optionKey: string; content: string; polarity: number; score: number; sortOrder: number }[] {
  return LIKERT_LABELS.map((label, i) => {
    const base = FORWARD_MAP[i];
    const polarity = base.score === 0 ? base.polarity
      : pole === 1 ? base.polarity : base.polarity === 1 ? 2 : 1;
    const value = encodeValue(polarity, base.score);
    return {
      id: `opt-${value}`,
      optionKey: String.fromCharCode(65 + i),
      content: label,
      polarity,
      score: base.score,
      sortOrder: i + 1,
    };
  });
}

/**
 * 完整 40 题 Mock 题库（v2）。
 * id 采用 `mq-${dim}-${序号}` 与后端 BigInt id 区分。
 */
export const MOCK_QUESTIONS: Question[] = GROUPS.flatMap((g) =>
  g.items.map((it, i) => {
    const seq = i + 1;
    const q: Question = {
      id: `mq-${g.dim}-${seq}`,
      dimension: g.dim,
      content: it.content,
      sortOrder: seq,
      isReverse: it.pole === 2 ? 1 : 0,
      options: buildOptions(it.pole),
    };
    return q;
  }),
);

/** questionId → dimension 的映射，供本地评分快速查维度。 */
export const MOCK_QUESTION_DIM: Record<string, Dimension> = Object.fromEntries(
  MOCK_QUESTIONS.map((q) => [q.id, q.dimension]),
);