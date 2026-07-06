import { Injectable } from '@nestjs/common';
import {
  Dimension,
  DIMENSION_POLES,
  MBTI_DIMENSION_ORDER,
  Polarity,
  TypeGroup,
} from './assessment.constants';

/** 计分输入的单条已作答记录（题目维度 + 所选选项极性 + 分值）。 */
export interface ScoredAnswer {
  dimension: number;
  polarity: number;
  score: number;
}

/** 单维度得分明细：两极分值与归一化后的偏好百分比（0-100）。 */
export interface DimensionScore {
  /** polarity=1 极累计分 */
  first: number;
  /** polarity=2 极累计分 */
  second: number;
  /** 判定出的字母 */
  letter: string;
  /** 该字母的偏好强度百分比（Decimal(5,2) 存储用） */
  percent: number;
}

/** 计分结果：4 字母类型 + 四维明细 + 分组。 */
export interface ScoringResult {
  mbtiType: string;
  scoreEi: number;
  scoreSn: number;
  scoreTf: number;
  scoreJp: number;
  typeGroup: number;
  /** 是否边界/异常（如某维度平票） */
  isAbnormal: boolean;
}

/**
 * ScoringService — MBTI 纯规则计分。
 * 规则：EI/SN/TF/JP 四维各自累加所选选项分值（按极性归极），
 * 比较两极总分判定字母，拼出 4 字母类型。严禁调用 LLM。
 */
@Injectable()
export class ScoringService {
  /** 对单个维度累加两极分值并判定字母。 */
  private scoreDimension(dimension: number, answers: ScoredAnswer[]): DimensionScore {
    const poles = DIMENSION_POLES[dimension];
    let first = 0;
    let second = 0;
    for (const a of answers) {
      if (a.dimension !== dimension) continue;
      if (a.polarity === Polarity.FIRST) first += a.score;
      else if (a.polarity === Polarity.SECOND) second += a.score;
    }
    const total = first + second;
    // 平票时按约定偏向第二极（I/N/F/P），并标记异常；无作答同样偏向第二极。
    const letter =
      first > second ? poles[0] : poles[1];
    // 偏好强度：优势极占比（无作答记为 50）。
    const dominant = Math.max(first, second);
    const percent = total > 0 ? Math.round((dominant / total) * 10000) / 100 : 50;
    return { first, second, letter, percent };
  }

  /** 依据 4 字母判定气质分组（type_group）。 */
  private resolveGroup(type: string): number {
    const hasN = type.includes('N');
    const hasS = type.includes('S');
    if (hasN && type.includes('T')) return TypeGroup.ANALYST; // NT 分析家
    if (hasN && type.includes('F')) return TypeGroup.DIPLOMAT; // NF 外交家
    if (hasS && type.includes('J')) return TypeGroup.SENTINEL; // SJ 守护者
    return TypeGroup.EXPLORER; // SP 探索家
  }

  /**
   * 计分主入口：输入全部已作答项，输出 MBTI 类型与四维分值。
   * @param answers 每条含 dimension/polarity/score
   */
  score(answers: ScoredAnswer[]): ScoringResult {
    const dimScores: Record<number, DimensionScore> = {};
    let abnormal = false;
    for (const dim of MBTI_DIMENSION_ORDER) {
      const ds = this.scoreDimension(dim, answers);
      dimScores[dim] = ds;
      if (ds.first === ds.second) abnormal = true; // 平票视为边界
    }

    const mbtiType = MBTI_DIMENSION_ORDER.map((d) => dimScores[d].letter).join('');
    const typeGroup = this.resolveGroup(mbtiType);

    return {
      mbtiType,
      scoreEi: dimScores[Dimension.EI].percent,
      scoreSn: dimScores[Dimension.SN].percent,
      scoreTf: dimScores[Dimension.TF].percent,
      scoreJp: dimScores[Dimension.JP].percent,
      typeGroup,
      isAbnormal: abnormal,
    };
  }
}