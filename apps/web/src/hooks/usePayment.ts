/**
 * 支付订单相关 React Query hooks（T2-08 / T2-09 / T2-11）
 *
 * 由于后端暂未提供 GET /payments/orders(/:id)，本地以 localStorage 维护订单缓存，
 * 支撑订单列表/详情页展示与关单倒计时。无真实后端时下单/支付走 mock fallback。
 * TODO(blocked)：联调后端 GET 订单接口后删除本地缓存与 mock fallback（见 阶段2 待办清单）。
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { paymentApi } from '../api';
import type { PaymentOrder, PrepayResult } from '../api/modules/payment.api';
import { OrderStatus } from '../api/modules/payment.api';
import { reportApi } from '../api';

const ORDER_CACHE_KEY = 'iq_orders_cache';

export const paymentKeys = {
  orders: ['payment', 'orders'] as const,
  order: (id: string) => ['payment', 'order', id] as const,
};

// ============ 本地订单缓存（mock fallback，联调后删除） ============

function readCache(): PaymentOrder[] {
  try {
    const raw = localStorage.getItem(ORDER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as PaymentOrder[]) : [];
  } catch {
    return [];
  }
}

function writeCache(orders: PaymentOrder[]): void {
  try {
    localStorage.setItem(ORDER_CACHE_KEY, JSON.stringify(orders));
  } catch {
    /* 忽略存储异常 */
  }
}

/** upsert 订单到本地缓存 */
export function upsertOrderCache(order: PaymentOrder): void {
  const list = readCache();
  const idx = list.findIndex((o) => o.id === order.id);
  if (idx >= 0) list[idx] = order;
  else list.unshift(order);
  writeCache(list);
}

/** 构造 mock 订单（无后端兜底） */
function mockOrder(bizType: number, bizId: string): PaymentOrder {
  const now = Date.now();
  return {
    id: `mock-${now}`,
    payNo: `PAYMOCK${now}`,
    bizType,
    bizId,
    subject: bizType === 3 ? 'InnerQuest 会员套餐（mock）' : `报告解锁（mock）`,
    amount: 990,
    status: OrderStatus.PENDING,
    statusLabel: 'pending',
    channel: null,
    expireAt: new Date(now + 15 * 60 * 1000).toISOString(),
    paidAt: null,
  };
}

// ============ 创建订单 ============

/** 多态下单：失败走 mock fallback，并写入本地缓存 */
export function useCreateOrder() {
  return useMutation<PaymentOrder, unknown, { bizType: number; bizId: string }>({
    mutationFn: async ({ bizType, bizId }) => {
      let order: PaymentOrder;
      try {
        order = await paymentApi.createOrder(bizType, bizId);
      } catch {
        order = mockOrder(bizType, bizId); // 无后端兜底
      }
      upsertOrderCache(order);
      return order;
    },
  });
}

// ============ 发起支付 ============

/** 发起支付：金额不符 70003 由 ApiError 上抛；mock 通道直接返回成功参数 */
export function usePayOrder() {
  const qc = useQueryClient();
  return useMutation<PrepayResult, unknown, { orderId: string; channel?: number }>({
    mutationFn: async ({ orderId, channel }) => {
      try {
        return await paymentApi.payOrder(orderId, channel);
      } catch (err) {
        // mock fallback：仅当订单为本地 mock 时兜底，其余错误(如 70003)上抛
        if (orderId.startsWith('mock-')) {
          return {
            orderId,
            payNo: `PAYMOCK${Date.now()}`,
            amount: 990,
            channel: channel ?? 1,
            prepayId: `mockprepay${Date.now()}`,
            payParams: {},
            mock: true,
          };
        }
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: paymentKeys.orders });
    },
  });
}

/** 将本地缓存订单标记为已支付（mock 通道支付成功后回写） */
export function markOrderPaid(orderId: string): PaymentOrder | undefined {
  const list = readCache();
  const idx = list.findIndex((o) => o.id === orderId);
  if (idx < 0) return undefined;
  list[idx] = {
    ...list[idx],
    status: OrderStatus.PAID,
    statusLabel: 'paid',
    paidAt: new Date().toISOString(),
  };
  writeCache(list);
  return list[idx];
}

// ============ 订单列表 / 详情（T2-09，本地缓存驱动 + 定时刷新） ============

/** 我的订单列表：本地缓存驱动，10s 轮询以刷新关单倒计时/状态 */
export function useOrders() {
  return useQuery<PaymentOrder[]>({
    queryKey: paymentKeys.orders,
    queryFn: async () => {
      const list = readCache();
      // 前端侧过期判定：PENDING 且已过 expireAt → 视为已关闭
      const now = Date.now();
      let mutated = false;
      const next = list.map((o) => {
        if (
          o.status === OrderStatus.PENDING &&
          o.expireAt &&
          new Date(o.expireAt).getTime() <= now
        ) {
          mutated = true;
          return { ...o, status: OrderStatus.CLOSED, statusLabel: 'closed' };
        }
        return o;
      });
      if (mutated) writeCache(next);
      return next;
    },
    refetchInterval: 10_000,
  });
}

/** 单个订单详情（本地缓存） */
export function useOrder(orderId: string) {
  return useQuery<PaymentOrder | undefined>({
    queryKey: paymentKeys.order(orderId),
    enabled: !!orderId,
    queryFn: async () => readCache().find((o) => o.id === orderId),
    refetchInterval: 5_000,
  });
}

// ============ 报告解锁（支付成功后放开付费段） ============

/** 支付成功后解锁报告付费段 */
export function useUnlockReport() {
  const qc = useQueryClient();
  return useMutation<unknown, unknown, string>({
    mutationFn: async (reportId: string) => {
      try {
        return await reportApi.unlockReport(reportId);
      } catch {
        return { unlocked: true, mock: true }; // 无后端兜底
      }
    },
    onSuccess: (_d, reportId) => {
      // 与 useReport 的 queryKey 对齐（report/detail/:id），放行 RequirePaid
      qc.invalidateQueries({ queryKey: ['report', 'detail', reportId] });
    },
  });
}