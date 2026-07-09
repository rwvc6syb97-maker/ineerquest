/**
 * 会员套餐 + 激活码兑换 API
 * 对齐权威契约 v2.0（模块 9）：
 *  GET  /memberships/plans    上架套餐列表  data: { list: MembershipPlan[] }
 *  POST /memberships/redeem   兑换激活码（需登录）
 *  GET  /memberships/me       我的会员状态（需登录）
 *  GET  /memberships/records  我的兑换记录（需登录）
 * 专属错误码 46xx（4601 无效 / 4602 已用 / 4603 过期 / 4604 作废 / 4605 无需降级）。
 * 说明：报错文案一律使用后端返回 message，前端不硬编码业务报错文本；
 *      所有 data 字段读取均做可选判空，防止 undefined 崩溃。
 */
import { request } from '../client';

/**
 * 套餐 VO（对齐契约 §9.2①：planId / name / level / durationDays / benefits）
 * 展示与下单所需的扩展字段（price / code / subtitle / originalPrice / isRecommended）
 * 后端如返回则使用，未返回时前端做判空降级，不影响契约核心字段。
 */
export interface MembershipPlan {
  /** 套餐主键（契约字段） */
  planId: number;
  /** 套餐名称 */
  name: string;
  /** 等级：1 Pro / 2 辅导 */
  level: number;
  /** 有效期天数，永久为 null */
  durationDays: number | null;
  /** 权益点列表 */
  benefits: string[];
  /** 以下为下单/展示扩展字段，后端可选返回 */
  code?: string;
  subtitle?: string | null;
  price?: number;
  originalPrice?: number | null;
  isRecommended?: number;
  sortOrder?: number;
}

/** 会员状态（对齐契约 §9.2③：level / expireAt / isActive） */
export interface MembershipStatus {
  /** 当前会员等级：0 免费 / 1 Pro / 2 辅导 */
  level: number;
  /** 到期时间，未开通或永久为 null */
  expireAt: string | null;
  /** 是否处于有效期内 */
  isActive: boolean;
}

/** 兑换结果（对齐契约 §9.2②） */
export interface RedeemResult {
  redeemId: number;
  planId: number;
  /** 兑换后等级：1 Pro / 2 辅导 */
  level: number;
  /** 兑换后会员到期时间 */
  membershipExpireAt: string;
  /** 后端返回的提示文案 */
  message: string;
}

/** 单条兑换记录 */
export interface MembershipRecord {
  redeemId: number;
  planId: number;
  level: number;
  expireAt: string;
  redeemedAt: string;
}

/** 获取上架套餐列表：后端返回 { list } 结构，做判空降级为 [] */
export async function listPlans(): Promise<MembershipPlan[]> {
  const data = await request<{ list: MembershipPlan[] } | MembershipPlan[]>({
    url: '/memberships/plans',
    method: 'GET',
  });
  // 兼容 { list } 与直接数组两种解包形态，任意缺失均降级为空数组
  if (Array.isArray(data)) return data;
  return data?.list ?? [];
}

/** 兑换激活码（需登录）：失败以 ApiError 抛出，文案用后端 message */
export function redeemCode(code: string): Promise<RedeemResult> {
  return request<RedeemResult>({
    url: '/memberships/redeem',
    method: 'POST',
    data: { code: code.trim() },
  });
}

/** 查当前会员状态（需登录） */
export function getMembershipStatus(): Promise<MembershipStatus> {
  return request<MembershipStatus>({ url: '/memberships/me', method: 'GET' });
}

/** 我的兑换记录（需登录）：做判空降级为 [] */
export async function getMembershipRecords(): Promise<MembershipRecord[]> {
  const data = await request<{ list: MembershipRecord[] } | MembershipRecord[]>({
    url: '/memberships/records',
    method: 'GET',
  });
  if (Array.isArray(data)) return data;
  return data?.list ?? [];
}