/**
 * 支付订单体系常量 —— 严格回溯《数据库设计文档.md》§10 与《后端设计文档.md》§支付。
 * 金额一律以「分」(BIGINT) 计；多态订单通过 biz_type + biz_id 承载三业务。
 */

/** 业务类型（payment_order.biz_type）。 */
export const BizType = {
  /** 报告解锁（biz_id 指向 report.id） */
  REPORT_UNLOCK: 1,
  /** 咨询订单（biz_id 指向 coaching_order.id） */
  COACHING: 2,
  /** 会员/套餐（biz_id 指向 membership_plan.id） */
  MEMBERSHIP: 3,
} as const;

export const BIZ_TYPE_VALUES: number[] = [
  BizType.REPORT_UNLOCK,
  BizType.COACHING,
  BizType.MEMBERSHIP,
];

/** 支付渠道（payment_order.channel / payment_transaction.channel）。 */
export const PayChannel = {
  WECHAT: 1,
  ALIPAY: 2,
  BALANCE: 3,
} as const;

/** 渠道字符串 → 数值映射（回调路由 :channel）。 */
export const CHANNEL_MAP: Record<string, number> = {
  wechat: PayChannel.WECHAT,
  alipay: PayChannel.ALIPAY,
  balance: PayChannel.BALANCE,
};

/** 支付订单状态（payment_order.status）。 */
export const OrderStatus = {
  PENDING: 1,
  PAID: 2,
  CLOSED: 3,
  REFUNDED: 4,
  PARTIAL_REFUNDED: 5,
} as const;

/** 订单状态标签（便于前端/日志展示）。 */
export const ORDER_STATUS_LABEL: Record<number, string> = {
  1: 'pending',
  2: 'paid',
  3: 'closed',
  4: 'refunded',
  5: 'partial_refunded',
};

/** 支付流水状态（payment_transaction.status）。 */
export const TransactionStatus = {
  PROCESSING: 1,
  SUCCESS: 2,
  FAILED: 3,
} as const;

/** 支付流水类型（payment_transaction.type）。 */
export const TransactionType = {
  PAY: 1,
  REFUND: 2,
} as const;

/** 退款单状态（payment_refund.status）。 */
export const RefundStatus = {
  APPLYING: 1,
  PROCESSING: 2,
  SUCCESS: 3,
  FAILED: 4,
} as const;

/** 订单支付超时时长：15 分钟（毫秒）。 */
export const ORDER_TTL_MS = 15 * 60 * 1000;

/** 延迟关单队列 key 前缀（Redis ZSET，score=到期时间戳）。 */
export const CLOSE_QUEUE_KEY = 'payment:close:queue';

/** 报告解锁一口价（分）：无 membership_plan 定价时的兜底金额。 */
export const REPORT_UNLOCK_PRICE = 990;