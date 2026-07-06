/**
 * 会员套餐商品常量 —— 严格回溯《数据库设计文档.md》membership_plan 表。
 * 金额一律以「分」(BIGINT) 计。上下架状态复用 PlanStatus。
 */

/** 套餐上下架状态（membership_plan.status）。 */
export const PlanStatus = {
  /** 下架 */
  OFFLINE: 0,
  /** 上架 */
  ONLINE: 1,
} as const;

export const PLAN_STATUS_VALUES: number[] = [PlanStatus.OFFLINE, PlanStatus.ONLINE];

/** 套餐类型（membership_plan.plan_type）：1单次 2周期会员。 */
export const PlanType = {
  ONCE: 1,
  PERIOD: 2,
} as const;

export const PLAN_TYPE_VALUES: number[] = [PlanType.ONCE, PlanType.PERIOD];