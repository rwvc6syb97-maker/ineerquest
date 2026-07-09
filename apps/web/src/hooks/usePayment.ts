/**
 * 支付订单相关 React Query hooks（T2-08 / T2-09 / T2-11）
 *
 * 下单/支付/解锁一律走后端真实接口，失败时抛出真实 ApiError（如金额不符 70003），
 * 交由调用方（CheckoutPage 的 onError）呈现错误态，禁止用 mock 假订单覆盖。
 * 由于后端暂未提供 GET /payments/orders(/:id)，仅订单列表/详情以 localStorage 缓存
 * 支撑展示与关单倒计时（此为既有设计，非"接口失败即 mock"）。
 * TODO(blocked)：联调后端 GET 订单接口后迁移订单列表/详情为服务端数据源。
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

// ============ 创建订单 ============

/** 多态下单：失败抛 ApiError（交由页面 onError 呈现），成功写入本地缓存 */
export function useCreateOrder() {
  return useMutation<PaymentOrder, unknown, { bizType: number; bizId: string }>({
    mutationFn: async ({ bizType, bizId }) => {
      const order = await paymentApi.createOrder(bizType, bizId);
      upsertOrderCache(order);
      return order;
    },
  });
}

// ============ 发起支付 ============

/** 发起支付：失败抛 ApiError（如金额不符 70003），交由页面 onError 呈现 */
export function usePayOrder() {
  const qc = useQueryClient();
  return useMutation<PrepayResult, unknown, { orderId: string; channel?: number }>({
    mutationFn: ({ orderId, channel }) => paymentApi.payOrder(orderId, channel),
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

/** 支付成功后解锁报告付费段（失败抛 ApiError，交由页面 onError 呈现） */
export function useUnlockReport() {
  const qc = useQueryClient();
  return useMutation<unknown, unknown, string>({
    mutationFn: (reportId: string) => reportApi.unlockReport(reportId),
    onSuccess: (_d, reportId) => {
      // 与 useReport 的 queryKey 对齐（report/detail/:id），放行 RequirePaid
      qc.invalidateQueries({ queryKey: ['report', 'detail', reportId] });
    },
  });
}