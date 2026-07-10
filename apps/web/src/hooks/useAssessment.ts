/**
 * 测评相关 React Query hooks
 * -------------------------------------------------------------
 * 全链路走真实后端接口（齐契约 v2.0/v2.1），不再有任何 mock 兜底/本地短路。
 * 接口失败一律抛 ApiError，交由页面错误态（isError + refetch）呈现。
 *
 * 对应后端接口：
 *   GET   /assessments/questions
 *   POST  /assessments/records
 *   PATCH /assessments/records/:id/answers
 *   POST  /assessments/records/:id/submit
 *   GET   /assessments/records/:id/result
 */
import { useQuery, useMutation } from '@tanstack/react-query';
import { assessmentApi } from '../api';
import type { QuestionBank, AssessmentResult } from '../api/modules/assessment.api';

export const assessmentKeys = {
  questions: (v: string) => ['assessment', 'questions', v] as const,
  records: ['assessment', 'records'] as const,
  result: (id: string) => ['assessment', 'result', id] as const,
};

/** 取题：直连后端，失败抛 ApiError 交页面错误态 */
export function useQuestions(version = 'v2') {
  return useQuery<QuestionBank>({
    queryKey: assessmentKeys.questions(version),
    queryFn: () => assessmentApi.getQuestions(version),
    staleTime: 30 * 60 * 1000,
  });
}

/** 创建测评记录（进入答题时调用），直连后端 */
export function useCreateRecord() {
  return useMutation<Awaited<ReturnType<typeof assessmentApi.createRecord>>, Error, string>({
    mutationFn: (version) => assessmentApi.createRecord(version),
  });
}

/** 保存草稿续答，直连后端 PATCH answers */
export function useSaveAnswers() {
  return useMutation({
    mutationFn: (p: {
      recordId: string;
      answers: { questionId: number; optionId: number }[];
    }) => assessmentApi.saveAnswers(p.recordId, p.answers),
  });
}

/** 提交计分，直连后端，结果取后端返回 */
export function useSubmitRecord() {
  return useMutation<AssessmentResult, Error, string>({
    mutationFn: (recordId) => assessmentApi.submitRecord(recordId),
  });
}

/** 结果详情，直连后端 */
export function useResult(recordId: string, enabled = true) {
  return useQuery({
    queryKey: assessmentKeys.result(recordId),
    queryFn: () => assessmentApi.getResult(recordId),
    enabled: enabled && !!recordId,
  });
}