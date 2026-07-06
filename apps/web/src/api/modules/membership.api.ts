/**
 * 会员套餐 + 激活码兑换 API
 * 对齐端契约：
 *  GET /membership/plans        上架套餐列表
 *  GET /membership/plans/:code  按编码查套餐详情
 *  POST /membership/redeem      兑换激活码（需登录）
 *  GET /membership/status       查当前会员状态（需登录）
 */
import { request } from '../client';

/** 套餐 VO（对齐 MembershipService.toPublicVo） */
export interface MembershipPlan {
  id: string;
  code: string;
  name: string;
  subtitle: string | null;
  price: number;
  originalPrice: number | null;
  durationDays: number | null;
  planType: number;
  benefits: unknown;
  sortOrder: number;
  isRecommended: number;
}

/** 会员状态 */
export interface MembershipStatus {
  isPaid: number;
  paidExpireAt: string | null;
  expired: boolean;
}

/** 兑换结果 */
export interface RedeemResult {
  planName: string;
  durationDays: number | null;
  expireAt: string | null;
}

/** 获取上架套餐列表 */
export function listPlans(): Promise<MembershipPlan[]> {
  return request<MembershipPlan[]>({ url: '/membership/plans', method: 'GET' });
}

/** 按编码获取套餐详情 */
export function getPlan(code: string): Promise<MembershipPlan> {
  return request<MembershipPlan>({ url: `/membership/plans/${code}`, method: 'GET' });
}

/** 兑换激活码（无后端时 mock 成功返回） */
export async function redeemCode(code: string): Promise<RedeemResult> {
  try {
    return await request<RedeemResult>({ url: '/membership/redeem', method: 'POST', data: { code } });
  } catch {
    // 无后端兜底：根据激活码前缀 mock 不同套餐
    const mockMap: Record<string, RedeemResult> = {
      DEMO: { planName: 'Pro 月度', durationDays: 30, expireAt: new Date(Date.now() + 30 * 86400_000).toISOString() },
      TEST: { planName: 'Pro 年度', durationDays: 365, expireAt: new Date(Date.now() + 365 * 86400_000).toISOString() },
    };
    const prefix = code.slice(0, 4).toUpperCase();
    if (mockMap[prefix]) return mockMap[prefix];
    // 任意其他码也 mock 成功
    return { planName: 'Pro 月度', durationDays: 30, expireAt: new Date(Date.now() + 30 * 86400_000).toISOString() };
  }
}

/** 查当前会员状态（无后端时 mock 未付费） */
export async function getMembershipStatus(): Promise<MembershipStatus> {
  try {
    return await request<MembershipStatus>({ url: '/membership/status', method: 'GET' });
  } catch {
    return { isPaid: 0, paidExpireAt: null, expired: false };
  }
}