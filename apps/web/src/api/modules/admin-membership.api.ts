/**
 * 运营后台 - 会员套餐管理 API
 * -------------------------------------------------------------
 * 对齐后端 MembershipAdminController：
 *   GET    /admin/membership-plans        列表
 *   GET    /admin/membership-plans/:id    详情
 *   POST   /admin/membership-plans        创建
 *   PUT    /admin/membership-plans/:id    更新
 *   DELETE /admin/membership-plans/:id    软删除
 *   PATCH  /admin/membership-plans/:id/status  上下架
 */
import { adminRequest } from '../admin-client';

export interface AdminPlan {
  id: string;
  code: string;
  name: string;
  subtitle: string | null;
  price: number;
  originalPrice: number | null;
  durationDays: number | null;
  planType: number;
  benefits: string[];
  sortOrder: number;
  isRecommended: number;
  status: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlanParams {
  code: string;
  name: string;
  subtitle?: string;
  price: number;
  originalPrice?: number;
  durationDays?: number;
  planType?: number;
  benefits?: string[];
  sortOrder?: number;
  isRecommended?: number;
}

export interface UpdatePlanParams extends Partial<CreatePlanParams> {}

export function listPlans(): Promise<AdminPlan[]> {
  return adminRequest<AdminPlan[]>({ url: '/admin/membership-plans', method: 'GET' });
}

export function getPlan(id: string): Promise<AdminPlan> {
  return adminRequest<AdminPlan>({ url: `/admin/membership-plans/${id}`, method: 'GET' });
}

export function createPlan(data: CreatePlanParams): Promise<AdminPlan> {
  return adminRequest<AdminPlan>({ url: '/admin/membership-plans', method: 'POST', data });
}

export function updatePlan(id: string, data: UpdatePlanParams): Promise<AdminPlan> {
  return adminRequest<AdminPlan>({ url: `/admin/membership-plans/${id}`, method: 'PUT', data });
}

export function deletePlan(id: string): Promise<void> {
  return adminRequest<void>({ url: `/admin/membership-plans/${id}`, method: 'DELETE' });
}

export function setPlanStatus(id: string, status: number): Promise<AdminPlan> {
  return adminRequest<AdminPlan>({ url: `/admin/membership-plans/${id}/status`, method: 'PATCH', data: { status } });
}
