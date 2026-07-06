/**
 * 辅导咨询相关 React Query hooks（P19-P26）
 * -------------------------------------------------------------
 * 无真实后端时用 mock 数据兜底。TODO(blocked)：联调后删除 fallback。
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

// ============ mock 数据 ============
const MOCK_COACHES: CoachCard[] = [
  { id: 'coach1', name: '林知远', title: '资深职业规划师 · 前大厂 HRD', domains: ['职业转型', '简历优化', '面试辅导'], price: 399, rating: 4.9, reviewCount: 128, orderCount: 340 },
  { id: 'coach2', name: '苏晚', title: 'ICF 认证生涯教练', domains: ['自我探索', '职业倦怠', '决策困惑'], price: 299, rating: 4.8, reviewCount: 96, orderCount: 210 },
  { id: 'coach3', name: '陈屿', title: '互联网产品负责人 · 兼职导师', domains: ['产品经理', '技术管理', '行业洞察'], price: 499, rating: 4.7, reviewCount: 64, orderCount: 150 },
  { id: 'coach4', name: '何岸', title: '心理咨询师 · 职场心理', domains: ['压力管理', '人际关系', '情绪调节'], price: 359, rating: 4.9, reviewCount: 88, orderCount: 190, closed: true },
];

function mockDetail(id: string): CoachDetail {
  const base = MOCK_COACHES.find((c) => c.id === id) || MOCK_COACHES[0];
  return {
    ...base,
    intro:
      '拥有多年一线职业辅导经验，擅长帮助来访者厘清职业目标、突破成长瓶颈。' +
      '会话以倾听与提问为主，结合结构化工具，陪你找到属于自己的答案。',
    experienceYears: 8,
    durationMin: 60,
    reviews: [
      { id: 'r1', userName: '匿名用户', rating: 5, content: '思路一下就清晰了，非常受用。', createdAt: '2026-06-20T10:00:00Z' },
      { id: 'r2', userName: '小A', rating: 5, content: '很有耐心，问题问得很到位。', createdAt: '2026-06-18T14:30:00Z' },
      { id: 'r3', userName: 'K', rating: 4, content: '整体不错，希望时间能更长一些。', createdAt: '2026-06-10T09:00:00Z' },
    ],
  };
}

function mockSchedule(): ScheduleSlot[] {
  const now = Date.now();
  const day = 24 * 3600 * 1000;
  const slots: ScheduleSlot[] = [];
  for (let d = 1; d <= 3; d += 1) {
    for (const h of [10, 14, 16, 20]) {
      const start = new Date(now + d * day);
      start.setHours(h, 0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 *1000);
      slots.push({
        slotId: `${d}-${h}`,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        available: !(d === 1 && h === 10), // 首个时段模拟已占用
      });
    }
  }
  return slots;
}

const MOCK_ORDERS: CoachingOrder[] = [
  { id: 'o1', coachId: 'coach1', coachName: '林知远', sessionId: 'sess-1', status: 'paid', price: 399, startAt: '2026-07-08T10:00:00Z', endAt: '2026-07-08T11:00:00Z', demand: '想聊聊转型产品经理', reviewed: false, createdAt: '2026-07-01T12:00:00Z' },
  { id: 'o2', coachId: 'coach2', coachName: '苏晚', sessionId: 'sess-2', status: 'completed', price: 299, startAt: '2026-06-20T14:00:00Z', endAt: '2026-06-20T15:00:00Z', demand: '职业倦怠', reviewed: true, createdAt: '2026-06-15T09:00:00Z' },
];

// ============ hooks ============

/** P19 辅导师列表（失败回退 mock，前端再做筛选） */
export function useCoaches(params?: ListCoachesParams) {
  return useQuery<CoachCard[]>({
    queryKey: coachingKeys.list(params),
    queryFn: async () => {
      try {
        const list = await coachingApi.listCoaches(params);
        return list.length ? list : MOCK_COACHES;
      } catch {
        return MOCK_COACHES;
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** P20 辅导师详情（失败回退 mock） */
export function useCoachDetail(id: string) {
  return useQuery<CoachDetail>({
    queryKey: coachingKeys.detail(id),
    enabled: !!id,
    queryFn: async () => {
      try {
        return await coachingApi.getCoach(id);
      } catch {
        return mockDetail(id);
      }
    },
  });
}

/** P21 可约时段（失败回退 mock） */
export function useCoachSchedule(id: string) {
  return useQuery<ScheduleSlot[]>({
    queryKey: coachingKeys.schedule(id),
    enabled: !!id,
    queryFn: async () => {
      try {
        const slots = await coachingApi.getSchedule(id);
        return slots.length ? slots : mockSchedule();
      } catch {
        return mockSchedule();
      }
    },
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

/** P26 我的辅导订单（失败回退 mock） */
export function useCoachingOrders() {
  return useQuery<CoachingOrder[]>({
    queryKey: coachingKeys.orders(),
    queryFn: async () => {
      try {
        return await coachingApi.listOrders();
      } catch {
        return MOCK_ORDERS;
      }
    },
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

export { MOCK_COACHES, MOCK_ORDERS };