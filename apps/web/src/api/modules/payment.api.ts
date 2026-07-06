/**
 * 支付订单服务 API（T2-08 / T2-09 / T2-11）
 * 严格对齐后端契约：
 *  POST /payments/orders            多态下单（bizType + bizId）
 *  POST /payments/orders/:id/pay    发起支付（金额不符 70003）
 *  POST /payments/orders/:id/refund 退款申请
 * 说明：后端未提供 GET /payments/orders(/:id)，订单列表/详情由前端本地缓存 +
 *      pay 返回态兜底（见 hooks/usePayment 的 mock fallback，联调后删除）。
 */
import { request } from '../client';

/** 业务类型：与后端 payment.constants.BizType 对齐 */
export const BizType = {
  /** 报告解锁（bizId → report.id） */
  REPORT_UNLOCK: 1,
  /** 咨询订单（bizId → coaching_order.id） */
  COACHING: 2,
  /** 会员/套餐（bizId → membership_plan.id） */
  MEMBERSHIP: 3,
} as const;
export type BizTypeValue = (typeof BizType)[keyof typeof BizType];

/** 订单状态：与后端 payment.constants.OrderStatus 对齐 */
export const OrderStatus = {
  PENDING: 1,
  PAID: 2,
  CLOSED: 3,
  REFUNDED: 4,
  PARTIAL_REFUNDED: 5,
} as const;
export type OrderStatusValue = (typeof OrderStatus)[keyof typeof OrderStatus];

/** 支付渠道 */
export const PayChannel = {
  WECHAT: 1,
  ALIPAY: 2,
  BALANCE: 3,
} as const;

/** 订单 VO（对齐 PaymentService.toOrderVo） */
export interface PaymentOrder {
  id: string;
  payNo: string;
  bizType: number;
  bizId: string;
  subject: string;
  /** 金额（分） */
  amount: number;
  status: number;
  /** pending/paid/closed/refunded/partial_refunded */
  statusLabel: string;
  channel: number | null;
  /** 15 分钟关单到期时间 */
  expireAt: string | null;
  paidAt: string | null;
}

/** 发起支付返回（对齐 PaymentService.pay） */
export interface PrepayResult {
  orderId: string;
  payNo: string;
  amount: number;
  channel: number;
  prepayId: string;
  payParams: Record<string, unknown>;
  /** mock 通道标记（真实微信支付未接入时为 true） */
  mock?: boolean;
}

/** 退款受理返回 */
export interface RefundResult {
  refundNo?: string;
  status: number;
}

/** 多态创建订单 */
export function createOrder(bizType: number, bizId: string): Promise<PaymentOrder> {
  return request<PaymentOrder>({
    url: '/payments/orders',
    method: 'POST',
    data: { bizType, bizId },
  });
}

/** 发起支付（金额不符返回 70003） */
export function payOrder(
  orderId: string,
  channel: number = PayChannel.WECHAT,
  openid?: string,
): Promise<PrepayResult> {
  return request<PrepayResult>({
    url: `/payments/orders/${orderId}/pay`,
    method: 'POST',
    data: { channel, openid },
  });
}

/** 退款申请 */
export function refundOrder(
  orderId: string,
  amount?: number,
  reason?: string,
): Promise<RefundResult> {
  return request<RefundResult>({
    url: `/payments/orders/${orderId}/refund`,
    method: 'POST',
    data: { amount, reason },
  });
}