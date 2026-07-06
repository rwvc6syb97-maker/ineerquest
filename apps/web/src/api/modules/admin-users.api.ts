/**
 * 运营后台 - 用户管理 API（T4-18 / P34）
 * -------------------------------------------------------------
 * 对齐后端 ops/users controller：
 *   GET  /admin/users            列表（user:read；脱敏，user:pii 权限返回明文）
 *                                参数 status/role/keyword/page/pageSize
 *   POST /admin/users/:id/ban    封禁（user:ban；BanUserDto：reason 必填 + confirm=true）
 *   POST /admin/users/:id/unban  解封（user:ban）
 */
import { adminRequest } from '../admin-client';

/** 用户状态：1 正常 / 0 封禁 / 2 注销中 */
export type UserStatus = 0 | 1 | 2;

/** 后台用户列表项（手机号默认脱敏，如 138****8000） */
export interface AdminUser {
  id: string;
  nickname: string;
  /** 手机号（无 user:pii 权限时为脱敏值） */
  phone: string;
  /** 是否已脱敏（true=当前展示的是脱敏值） */
  masked: boolean;
  status: UserStatus;
  role: number;
  /** 是否付费用户 */
  paid: boolean;
  registeredAt: string;
  lastActiveAt?: string;
  /** 封禁原因（status=0 时有值） */
  banReason?: string;
}

/** 列表查询参数 */
export interface ListUsersParams {
  status?: UserStatus;
  role?: number;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 列表返回（分页） */
export interface UserListResult {
  total: number;
  page: number;
  pageSize: number;
  list: AdminUser[];
}

/** 封禁请求体（对齐 BanUserDto：reason 必填，confirm 必须为 true） */
export interface BanUserParams {
  reason: string;
  confirm: true;
}

export function listUsers(params?: ListUsersParams): Promise<UserListResult> {
  return adminRequest<UserListResult>({ url: '/admin/users', method: 'GET', params });
}

export function banUser(id: string, body: BanUserParams): Promise<void> {
  return adminRequest<void>({ url: `/admin/users/${id}/ban`, method: 'POST', data: body });
}

export function unbanUser(id: string): Promise<void> {
  return adminRequest<void>({ url: `/admin/users/${id}/unban`, method: 'POST' });
}