/**
 * 职业相关 React Query hooks
 * -------------------------------------------------------------
 * 数据一律来自后端（GET /careers/recommend/:reportId、GET /careers/:id）。
 * 不做任何 mock 兜底：接口失败时抛出真实 ApiError，由页面 isError 呈现错误态 + 重试，
 * 避免静默降级掩盖前后端契约问题（对齐 useReport / useMembership 做法）。
 */
import { useQuery } from '@tanstack/react-query';
import { careerApi } from '../api';
import type { CareerCard, CareerDetail } from '../api/modules/career.api';

export const careerKeys = {
  recommend: (reportId: string) => ['career', 'recommend', reportId] as const,
  detail: (id: string) => ['career', 'detail', id] as const,
};

/** MBTI 匹配推荐 TOP（按 reportId 关联报告；失败抛 ApiError 交由页面错误态） */
export function useRecommendCareers(reportId: string) {
  return useQuery<CareerCard[]>({
    queryKey: careerKeys.recommend(reportId),
    enabled: !!reportId,
    queryFn: () => careerApi.recommendCareers(reportId),
    staleTime: 10 * 60 * 1000,
  });
}

/** 职业详情（失败抛 ApiError 交由页面错误态） */
export function useCareerDetail(id: string) {
  return useQuery<CareerDetail>({
    queryKey: careerKeys.detail(id),
    enabled: !!id,
    queryFn: () => careerApi.getCareer(id),
  });
}