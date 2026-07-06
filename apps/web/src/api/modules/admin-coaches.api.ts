/**
 * 运营后台 - 辅导师管理 API（T4-18 / P34）
 * -------------------------------------------------------------
 * 对齐后端 ops/coaches controller：
 *   GET    /admin/coaches               列表（coach:audit；auditStatus/status）
 *   POST   /admin/coaches/:id/audit     审核（coach:audit；AuditCoachDto：auditStatus 1通过/2驳回，驳回需 remark）
 *   POST   /admin/coaches/:id/shelf     上下架（coach:shelf；ShelfCoachDto：status 0下架需 reason+confirm，force 强制）
 *   GET    /admin/coaches/reviews       评价列表（review:manage）
 *   POST   /admin/coaches/reviews/:id/reply  回复评价（review:manage）
 *   DELETE /admin/coaches/reviews/:id   删除评价（review:manage）
 */
import { adminRequest } from '../admin-client';

/** 审核状态：0 待审 / 1 通过 / 2 驳回 */
export type CoachAuditStatus = 0 | 1 | 2;

/** 上下架状态：1 上架 / 0 下架 */
export type CoachShelfStatus = 0 | 1;

/** 后台辅导师列表项 */
export interface AdminCoach {
  id: string;
  name: string;
  avatar?: string;
  title: string;
  domains: string[];
  price: number;
  auditStatus: CoachAuditStatus;
  status: CoachShelfStatus;
  /** 驳回备注 */
  remark?: string;
  submittedAt?: string;
}

/** 列表查询参数 */
export interface ListCoachesParams {
  auditStatus?: CoachAuditStatus;
  status?: CoachShelfStatus;
  page?: number;
  pageSize?: number;
}

/** 列表返回（分页） */
export interface CoachListResult {
  total: number;
  page: number;
  pageSize: number;
  list: AdminCoach[];
}

/** 审核请求体（对齐 AuditCoachDto，驳回时 remark 必填） */
export interface AuditCoachParams {
  /** 1 通过 / 2 驳回 */
  auditStatus: 1 | 2;
  /** 驳回原因（auditStatus=2 时必填） */
  remark?: string;
}

/** 上下架请求体（对齐 ShelfCoachDto，下架需 reason + confirm） */
export interface ShelfCoachParams {
  /** 1 上架 / 0 下架 */
  status: CoachShelfStatus;
  /** 下架原因（status=0 时必填） */
  reason?: string;
  /** 下架确认（status=0 时须为 true） */
  confirm?: boolean;
  /** 强制下架（无视进行中订单） */
  force?: boolean;
}

/** 后台评价项 */
export interface AdminReview {
  id: string;
  coachId: string;
  coachName: string;
  userName: string;
  rating: number;
  content: string;
  /** 官方回复 */
  reply?: string;
  createdAt: string;
}

/** 评价列表查询参数 */
export interface ListReviewsParams {
  coachId?: string;
  page?: number;
  pageSize?: number;
}

/** 评价列表返回（分页） */
export interface ReviewListResult {
  total: number;
  page: number;
  pageSize:number;
  list: AdminReview[];
}

export function listCoaches(params?: ListCoachesParams): Promise<CoachListResult> {
  return adminRequest<CoachListResult>({ url: '/admin/coaches', method: 'GET', params });
}

export function auditCoach(id: string, body: AuditCoachParams): Promise<void> {
  return adminRequest<void>({ url: `/admin/coaches/${id}/audit`, method: 'POST', data: body });
}

export function shelfCoach(id: string, body: ShelfCoachParams): Promise<void> {
  return adminRequest<void>({ url: `/admin/coaches/${id}/shelf`, method: 'POST', data: body });
}

export function listReviews(params?: ListReviewsParams): Promise<ReviewListResult> {
  return adminRequest<ReviewListResult>({ url: '/admin/coaches/reviews', method: 'GET', params });
}

export function replyReview(id: string, reply: string): Promise<void> {
  return adminRequest<void>({
    url: `/admin/coaches/reviews/${id}/reply`,
    method: 'POST',
    data: { reply },
  });
}

export function deleteReview(id: string): Promise<void> {
  return adminRequest<void>({ url: `/admin/coaches/reviews/${id}`, method: 'DELETE' });
}