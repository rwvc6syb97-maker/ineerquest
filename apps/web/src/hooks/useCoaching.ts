/**
 * 辅导咨询相关 React Query hooks（P19-P26）
 * -------------------------------------------------------------
 * 数据一律来自后端（coaches、coaches/:id、schedule、orders）。
 * 不做任何 mock 兜底：接口失败时抛出真实 ApiError，由页面 isError 呈现错误态 + 重试，
 * 避免静默降级掩盖前后端契约问题（对齐 useReport / useMembership 做法）。
 * 业务错误码：
 *   60001 时段已占用 -> 预约页刷新排期并禁用该时段
 *   60002 辅导师停止接单 -> 详情/预约页禁用下单
 * 通过 ApiError.code 分流，页面据此 toast。
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { coachingApi, ApiError } from '../api';
import type {
  CoachCard,
  CoachDetail,
  ScheduleSlot,
  CoachingOrder,
  ListCoachesParams,
  BookCoachingParams,
  BookCoachingResult,
  ReviewCoachingParams,
} from '../api/modules/coaching.api';

export const coachingKeys = {
  list: (params?: ListCoachesParams) => ['coaching', 'list', params ?? {}] as const,
  detail: (id: string) => ['coaching', 'detail', id] as const,
  schedule: (id: string) => ['coaching', 'schedule', id] as const,
  orders: () => ['coaching', 'orders'] as const,
};

/** 辅导咨询业务错误码（对齐后端 coaching.constants） */
export const COACHING_ERROR = {
  SLOT_TAKEN: 60001,
  COACH_CLOSED: 60002,
} as const;

// ============ hooks ============

/** P19 辅导师列表（失败抛 ApiError，交由页面错误态；前端仅做筛选） */
export function useCoaches(params?: ListCoachesParams) {
  return useQuery<CoachCard[]>({
    queryKey: coachingKeys.list(params),
    queryFn: () => coachingApi.listCoaches(params),
    staleTime: 5 * 60 * 1000,
  });
}

/** P20 辅导师详情（失败抛 ApiError，交由页面错误态） */
export function useCoachDetail(id: string) {
  return useQuery<CoachDetail>({
    queryKey: coachingKeys.detail(id),
    enabled: !!id,
    queryFn: () => coachingApi.getCoach(id),
  });
}

/** P21 可约时段（失败抛 ApiError，交由页面错误态） */
export function useCoachSchedule(id: string) {
  return useQuery<ScheduleSlot[]>({
    queryKey: coachingKeys.schedule(id),
    enabled: !!id,
    queryFn: () => coachingApi.getSchedule(id),
  });
}

/** P21 预约下单（返回订单，交由页面跳转收银台） */
export function useBookCoaching() {
  const qc = useQueryClient();
  return useMutation<BookCoachingResult, ApiError, BookCoachingParams>({
    mutationFn: (body) => coachingApi.bookCoaching(body),
    onSuccess: (_data, vars) => {
      // 预约成功后排期与订单失效
      qc.invalidateQueries({ queryKey: coachingKeys.schedule(vars.coachId) });
      qc.invalidateQueries({ queryKey: coachingKeys.orders() });
    },
  });
}

/** P26 我的辅导订单（失败抛 ApiError，交由页面错误态） */
export function useCoachingOrders() {
  return useQuery<CoachingOrder[]>({
    queryKey: coachingKeys.orders(),
    queryFn: () => coachingApi.listOrders(),
  });
}

/** P26 提交评价 */
export function useReviewCoaching() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { orderId: string; body: ReviewCoachingParams }>({
    mutationFn: ({ orderId, body }) => coachingApi.reviewCoaching(orderId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: coachingKeys.orders() });
    },
  });
}