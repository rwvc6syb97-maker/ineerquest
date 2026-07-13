/**
 * 会员套餐 React Query hooks
 * 对齐契约 v2.0（模块 9）：数据一律来自后端 GET /memberships/plans。
 * listPlans 已在 API 层对 { list } / 数组两种形态做判空降级为 []，
 * 故此处不再保留任何 mock 兜底，避免掩盖前后端契约问题。
 * 契约未提供“按标识查单个套餐”的接口，usePlan 从列表缓存中按 planId 筛选。
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { membershipApi } from '../api';
import type { MembershipPlan, MembershipStatus } from '../api/modules/membership.api';

export const membershipKeys = {
  plans: ['membership', 'plans'] as const,
  plan: (planId: number) => ['membership', 'plan', planId] as const,
  me: ['membership', 'me'] as const,
};

/**
 * 我的会员状态（GET /memberships/me，需登录）
 * 直连后端，失败不做 mock 兜底，交由页面 isLoading / isError 呈现真实态。
 */
export function useMembershipStatus() {
  return useQuery<MembershipStatus>({
    queryKey: membershipKeys.me,
    queryFn: () => membershipApi.getMembershipStatus(),
  });
}

/** 上架套餐列表（数据来源：后端，失败或空均降级为 []） */
export function usePlans() {
  return useQuery<MembershipPlan[]>({
    queryKey: membershipKeys.plans,
    queryFn: () => membershipApi.listPlans(),
  });
}

/**
 * 套餐详情：契约无独立详情接口，直接从已缓存的套餐列表中按 planId 筛选。
 * 若列表尚未缓存则触发一次列表拉取后再筛选。
 */
export function usePlan(planId: number) {
  const queryClient = useQueryClient();
  return useQuery<MembershipPlan | undefined>({
    queryKey: membershipKeys.plan(planId),
    enabled: !!planId,
    queryFn: async () => {
      let list = queryClient.getQueryData<MembershipPlan[]>(membershipKeys.plans);
      if (!list) {
        list = await membershipApi.listPlans();
        queryClient.setQueryData(membershipKeys.plans, list);
      }
      return list?.find((p) => p.planId === planId);
    },
  });
}