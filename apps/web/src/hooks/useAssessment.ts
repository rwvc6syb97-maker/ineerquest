/**
 * 测评相关 React Query hooks
 * -------------------------------------------------------------
 * 双链路策略：
 *  1) 真实接口链路：正常调用 assessmentApi.*（不破坏原有契约）。
 *  2) Mock 兜底链路：
 *     - Mock 登录模式（isMockAuthEnabled）下，取题/创建记录/提交直接短路，
 *       使用本地题库 + 纯规则本地评分生成 MBTI，无需后端即可完整走通
 *       答题 → 评分 → 报告。
 *     - 非 Mock 模式下，接口异常仍回退到本地题库，保证可用性。
 *
 * 本地评分与后端 ScoringService 一致（v2 李克特）：每维度累加所选 option 的 score，
 * 按 option.polarity 归极（value 编码 polarity*10+score，中立 value=0 不计），
 * first(polarity=1, E/S/T/J) > second(polarity=2, I/N/F/P) 取前极，否则后极。
 */
import { useQuery, useMutation } from '@tanstack/react-query';
import { assessmentApi } from '../api';
import type { Question, Dimension, AssessmentResult } from '../api/modules/assessment.api';
import { MOCK_QUESTIONS, MOCK_QUESTION_DIM, decodeValue } from '../api/modules/mockQuestions';
import { isMockAuthEnabled } from '../stores/auth.store';
import { useAssessmentStore } from '../stores/assessment.store';

/** 各维度两极字母：[前极(polarity=1), 后极(polarity=2)] */
const DIMENSION_POLES: Record<Dimension, [string, string]> = {
  EI: ['E', 'I'],
  SN: ['S', 'N'],
  TF: ['T', 'F'],
  JP: ['J', 'P'],
};

/** 维度可读中文两极（供报告 dimensions 展示） */
const DIMENSION_LABEL: Record<Dimension, { left: string; right: string }> = {
  EI: { left: '外向 E', right: '内向 I' },
  SN: { left: '实感 S', right: '直觉 N' },
  TF: { left: '思考 T', right: '情感 F' },
  JP: { left: '判断 J', right: '知觉 P' },
};

const DIM_ORDER: Dimension[] = ['EI', 'SN', 'TF', 'JP'];

export const assessmentKeys = {
  questions: (v: string) => ['assessment', 'questions', v] as const,
  records: ['assessment', 'records'] as const,
  result: (id: string) => ['assessment', 'result', id] as const,
};

/**
 * 本地纯规则评分：由 store.answers（questionId → 所选 value，编码 polarity*10+score）计算 MBTI。
 * 与后端 ScoringService.score 对齐：按 polarity 累加 score，first>second 取前极，
 * 平票/无作答取后极；percent 为优势极占比（无作答记 50）。
 */
export function localScore(answers: Record<string, string>): AssessmentResult & {
  mbtiType: string;
} {
  const tally: Record<Dimension, { first: number; second: number }> = {
    EI: { first: 0, second: 0 },
    SN: { first: 0, second: 0 },
    TF: { first: 0, second: 0 },
    JP: { first: 0, second: 0 },
  };

  for (const [qid, optId] of Object.entries(answers)) {
    const dim = MOCK_QUESTION_DIM[qid];
    if (!dim) continue;
    // 从 option id "opt-12" 提取数值
    const numVal = Number(String(optId).replace('opt-', ''));
    if (isNaN(numVal)) continue;
    const { polarity, score } = decodeValue(numVal);
    if (score <= 0) continue; // 中立不计
    if (polarity === 1) tally[dim].first += score;
    else if (polarity === 2) tally[dim].second += score;
  }

  const dimensions = {} as AssessmentResult['dimensions'];
  let mbtiType = '';
  for (const dim of DIM_ORDER) {
    const { first, second } = tally[dim];
    const poles = DIMENSION_POLES[dim];
    const letter = first > second ? poles[0] : poles[1];
    mbtiType += letter;
    const total = first + second;
    const dominant = Math.max(first, second);
    // score：越大越偏「后极(right)」，与报告 DimensionBar 语义一致。
    // 优势极占比映射到 0-100：前极占优 → <50，后极占优 → >50。
    const rightRatio = total > 0 ? second / total : 0.5;
    dimensions[dim] = {
      left: DIMENSION_LABEL[dim].left,
      right: DIMENSION_LABEL[dim].right,
      score: Math.round(rightRatio * 100),
    };
    // dominant 供潜在调试，保留计算不产生副作用
    void dominant;
  }

  return {
    recordId: '',
    mbtiType,
    dimensions,
    createdAt: new Date().toISOString(),
  };
}

/** 取题（Mock 模式直接返回本地题库；真实模式失败回退本地） */
export function useQuestions(version = 'v2') {
  return useQuery<Question[]>({
    queryKey: assessmentKeys.questions(version),
    queryFn: async () => {
      if (isMockAuthEnabled()) return MOCK_QUESTIONS;
      try {
        const list = await assessmentApi.getQuestions(version);
        return list.length ? list : MOCK_QUESTIONS;
      } catch {
        return MOCK_QUESTIONS; // 无后端兜底
      }
    },
    staleTime: 30 * 60 * 1000,
  });
}

/** 创建测评记录（Mock 模式生成本地临时 recordId） */
export function useCreateRecord() {
  return useMutation<Awaited<ReturnType<typeof assessmentApi.createRecord>>, Error, string>({
    mutationFn: async (version) => {
      if (isMockAuthEnabled()) {
        const now = new Date().toISOString();
        return {
          id: `local-${Date.now()}`,
          status: 'draft' as const,
          version,
          createdAt: now,
          updatedAt: now,
        };
      }
      return assessmentApi.createRecord(version);
    },
  });
}

/** 保存草稿续答（Mock 模式无需上报，草稿已由 store 本地持久化） */
export function useSaveAnswers() {
  return useMutation({
    mutationFn: async (p: {
      recordId: string;
      answers: { questionId: string; optionId: string }[];
    }) => {
      if (isMockAuthEnabled() || p.recordId.startsWith('local-')) {
        return undefined as unknown as Awaited<
          ReturnType<typeof assessmentApi.saveAnswers>
        >;
      }
      return assessmentApi.saveAnswers(p.recordId, p.answers);
    },
  });
}

/** 提交计分（Mock 模式本地评分并落地 iq_result_${id}，供报告页读取） */
export function useSubmitRecord() {
  return useMutation<AssessmentResult, Error, string>({
    mutationFn: async (recordId) => {
      if (isMockAuthEnabled() || recordId.startsWith('local-')) {
        const answers = useAssessmentStore.getState().answers;
        const result = localScore(answers);
        result.recordId = recordId;
        try {
          localStorage.setItem(`iq_result_${recordId}`, result.mbtiType);
        } catch {
          /* ignore */
        }
        return result;
      }
      return assessmentApi.submitRecord(recordId);
    },
  });
}

/** 结果详情 */
export function useResult(recordId: string, enabled = true) {
  return useQuery({
    queryKey: assessmentKeys.result(recordId),
    queryFn: () => assessmentApi.getResult(recordId),
    enabled: enabled && !!recordId && !isMockAuthEnabled(),
  });
}

export { MOCK_QUESTIONS };