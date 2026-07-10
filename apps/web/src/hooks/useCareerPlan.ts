/**
 * 职业规划扩展 hooks（P16 技能差距 / P17 学习资源 / P18 成长计划）
 * -------------------------------------------------------------
 * 数据一律来自后端（careers/:careerId/skill-gap、careers/:careerId/resources、growth/plan）。
 * 不做任何 mock 兜底：接口失败时抛出真实 ApiError，由页面 isError 呈现错误态 + 重试，
 * 避免静默降级掩盖前后端契约问题（对齐 useReport / useMembership 做法）。
 */
import { useQuery } from '@tanstack/react-query';
import { careerPlanApi } from '../api';
import type {
  SkillGapResult,
  LearningResource,
  GrowthPlan,
  ResourceType,
} from '../api/modules/career-plan.api';

export const careerPlanKeys = {
  skillGap: (careerId: string) => ['career-plan', 'skill-gap', careerId] as const,
  resources: (careerId: string, skill: string) =>
    ['career-plan', 'resources', careerId, skill] as const,
  growth: ['career-plan', 'growth'] as const,
};

// ---------------- Hooks ----------------
/** P16 技能差距分析（失败抛 ApiError，交由页面错误态） */
export function useSkillGap(careerId: string) {
  return useQuery<SkillGapResult>({
    queryKey: careerPlanKeys.skillGap(careerId),
    enabled: !!careerId,
    queryFn: () => careerPlanApi.getSkillGap(careerId),
  });
}

/** P17 学习资源推荐（careerId 必填；失败抛 ApiError，交由页面错误态） */
export function useLearningResources(params: { careerId?: string; skill?: string; type?: ResourceType }) {
  const { careerId, skill, type } = params;
  return useQuery<LearningResource[]>({
    queryKey: careerPlanKeys.resources(careerId || '', skill || 'all'),
    enabled: !!careerId,
    queryFn: () => careerPlanApi.listLearningResources({ careerId: careerId as string, skill, type }),
    staleTime: 5 * 60 * 1000,
  });
}

/** P18 成长计划 / 仪表盘（失败抛 ApiError，交由页面错误态） */
export function useGrowthPlans() {
  return useQuery<GrowthPlan[]>({
    queryKey: careerPlanKeys.growth,
    queryFn: () => careerPlanApi.getGrowthPlans(),
  });
}