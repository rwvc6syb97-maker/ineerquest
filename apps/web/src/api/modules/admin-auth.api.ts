/**
 * 运营后台 - 鉴权 API（scope=admin，与 C 端 auth 完全隔离）
 * -------------------------------------------------------------
 * 对齐后端 ops/auth controller：
 *   POST /admin/auth/login    账号密码登录，签发 admin token 与权限点
 *   POST /admin/auth/refresh  刷新 access token（client 拦截器复用）
 *   POST /admin/auth/logout   注销（吊销 refresh token）
 *
 * 登录返回的 admin.perms 为 RBAC 权限点数组（支持通配 * / ns:*）。
 */
import { adminRequest } from '../admin-client';

/** 后台管理员信息 */
export interface AdminProfile {
  id: string;
  nickname: string;
  /** 账号角色（数值，3=super_admin 默认全通配） */
  role: number;
  /** 业务管理员角色标识 */
  adminRole: string;
  /** RBAC 权限点（支持通配 * / analytics:* ） */
  perms: string[];
}

/** 登录请求体 */
export interface AdminLoginParams {
  username: string;
  password: string;
}

/** 登录 / 刷新返回 */
export interface AdminLoginResult {
  accessToken: string;
  refreshToken: string;
  admin: AdminProfile;
}

/** 后台登录 */
export function login(body: AdminLoginParams): Promise<AdminLoginResult> {
  return adminRequest<AdminLoginResult>({ url: '/admin/auth/login', method: 'POST', data: body });
}

/** 刷新 token（页面一般无需直接调用，由拦截器处理） */
export function refresh(refreshToken: string): Promise<AdminLoginResult> {
  return adminRequest<AdminLoginResult>({
    url: '/admin/auth/refresh',
    method: 'POST',
    data: { refreshToken },
  });
}

/** 后台登出 */
export function logout(): Promise<void> {
  return adminRequest<void>({ url: '/admin/auth/logout', method: 'POST' });
}