/**
 * 职业相关 React Query hooks
 * -------------------------------------------------------------
 * 数据一律来自后端（GET /careers、GET /careers/recommendations、GET /careers/:id）。
 * 不做任何 mock 兜底：接口失败时抛出真实 ApiError，由页面 isError 呈现错误态 + 重试，
 * 避免静默降级掩盖前后端契约问题（对齐 useReport / useMembership 做法）。
 */
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { careerApi } from '../api';
import type { CareerCard, CareerDetail } from '../api/modules/career.api';
import type { Paginated } from '@innerquest/shared';

export const careerKeys = {
  recommend: (reportId: string) => ['career', 'recommend', reportId] as const,
  detail: (id: string) => ['career', 'detail', id] as const,
  library: (page: number, pageSize: number, category: string) =>
    ['career', 'library', page, pageSize, category] as const,
};

/**
 * MBTI 匹配推荐 TOP。
 * reportId 可选：无 reportId 也照常请求，后端自动取用户最近报告；
 * 仅用户完全无报告时后端返 CAREER_NO_ASSESSMENT（业务码），交由页面识别处理。
 * 失败抛 ApiError 交由页面错误态。
 */
export function useRecommendCareers(reportId?: string) {
  return useQuery<CareerCard[]>({
    queryKey: careerKeys.recommend(reportId ?? ''),
    queryFn: () => careerApi.recommendCareers(reportId || undefined),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

/**
 * 职业库全量浏览列表（GET /careers，分页）。
 * 用于展示推荐岗位之外的职业库内容；失败抛 ApiError 交由页面错误态。
 */
export function useCareerLibrary(params: {
  page?: number;
  pageSize?: number;
  category?: string;
}) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 12;
  const category = params.category ?? '';
  return useQuery<Paginated<CareerCard>>({
    queryKey: careerKeys.library(page, pageSize, category),
    queryFn: () =>
      careerApi.listCareers({ page, pageSize, category: category || undefined }),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
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