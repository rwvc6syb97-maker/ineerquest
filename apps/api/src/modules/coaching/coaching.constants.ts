/**
 * 辅导咨询体系常量 —— 严格回溯《数据库设计文档.md》§9 辅导咨询与
 * 《Vibe-Coding执行计划与上线清单.md》T4-01~T4-04。
 *
 * 错误码约定（严格对齐主计划措辞）：
 * - 60001 时段已被占用（时段锁冲突 / uk_coach_slot 防重叠）
 * - 60002 辅导师已停止接单（下架 / 未审核通过）
 */

/** 辅导师审核状态（coach.audit_status）。 */
export const CoachAuditStatus = {
  /** 待审核 */
  PENDING: 0,
  /** 审核通过 */
  APPROVED: 1,
  /** 审核驳回 */
  REJECTED: 2,
} as const;

/** 辅导师上架状态（coach.status）。 */
export const CoachStatus = {
  /** 已下架 / 停止接单 */
  OFFLINE: 0,
  /** 已上架 / 正常接单 */
  ONLINE: 1,
} as const;

/**
 * 排期时段状态（coach_schedule.status）。
 * FREE → LOCKED（下单锁定，含 lock_expire_at）→ BOOKED（支付成功确认占用）。
 */
export const ScheduleStatus = {
  /** 可预约 */
  FREE: 1,
  /** 已锁定（下单占位，等待支付；超时释放回 FREE） */
  LOCKED: 2,
  /** 已确认占用（支付成功） */
  BOOKED: 3,
} as const;

/** 咨询订单状态（coaching_order.status）。 */
export const CoachingOrderStatus = {
  /** 待支付 */
  PENDING: 1,
  /** 已支付（时段已确认占用） */
  PAID: 2,
  /** 已完成（可评价） */
  FINISHED: 3,
  /** 已取消 / 关闭（时段已释放） */
  CANCELLED: 4,
} as const;

/** 咨询订单状态标签（便于前端/日志展示）。 */
export const COACHING_ORDER_STATUS_LABEL: Record<number, string> = {
  1: 'pending',
  2: 'paid',
  3: 'finished',
  4: 'cancelled',
};

/**
 * 时段分布式锁 key 前缀（Redis SET NX PX）。
 * 完整 key：`coaching:slot:lock:{scheduleId}`。
 */
export const SLOT_LOCK_KEY_PREFIX = 'coaching:slot:lock:';

/** 时段分布式锁持有时长（毫秒）：与支付超时对齐（15 分钟）。 */
export const SLOT_LOCK_TTL_MS = 15 * 60 * 1000;

/** 咨询订单支付超时时长：15 分钟（毫秒），超时释放时段。 */
export const COACHING_PAY_TTL_MS = 15 * 60 * 1000;

/** 支付业务类型：咨询订单（payment_order.biz_type = 2），复用 payment 下单能力。 */
export const COACHING_BIZ_TYPE = 2;

/** 评分取值范围（coaching_review.rating）。 */
export const RATING_MIN = 1;
export const RATING_MAX = 5;