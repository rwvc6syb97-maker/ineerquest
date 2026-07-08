/**
 * 认证服务 API（短信验证码 + 邮箱密码登录）
 * 对齐后端契约：POST /auth/sms/send、POST /auth/login、POST /auth/email/register、POST /auth/email/login、POST /auth/logout
 * 所有方法返回已解包业务数据；失败以 ApiError 抛出。
 */
import { request } from '../client';
import { setTokens, clearTokens } from '../token';

/** 登录用户信息（后端 /auth/login 返回的 user 字段） */
export interface AuthUser {
  id: string;
  nickname: string;
  phone?: string;
  email?: string;
  avatar?: string;
  mbtiType?: string | null;
}

/** 登录结果：accessToken/refreshToken/user */
export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

/** 发送短信验证码：60s 一次，超频返回 20001 */
export function sendSms(phone: string): Promise<{ expireIn: number }> {
  return request<{ expireIn: number }>({
    url: '/auth/sms/send',
    method: 'POST',
    data: { phone },
  });
}

/** 短信验证码登录：成功后写入 Token */
export async function loginBySms(phone: string, code: string): Promise<LoginResult> {
  const data = await request<LoginResult>({
    url: '/auth/login',
    method: 'POST',
    data: { phone, code, loginType: 'sms' },
  });
  setTokens(data.accessToken, data.refreshToken);
  return data;
}

/** 邮箱注册：成功后写入 Token */
export async function registerByEmail(
  email: string,
  password: string,
  nickname?: string,
): Promise<LoginResult> {
  const data = await request<LoginResult>({
    url: '/auth/email/register',
    method: 'POST',
    data: { email, password, nickname },
  });
  setTokens(data.accessToken, data.refreshToken);
  return data;
}

/** 邮箱+密码登录：成功后写入 Token */
export async function loginByEmail(email: string, password: string): Promise<LoginResult> {
  const data = await request<LoginResult>({
    url: '/auth/email/login',
    method: 'POST',
    data: { email, password },
  });
  setTokens(data.accessToken, data.refreshToken);
  return data;
}

/** 登出：清空本地 Token */
export async function logout(): Promise<void> {
  await request<void>({ url: '/auth/logout', method: 'POST' }).catch(() => undefined);
  clearTokens();
}

/** 发送邮箱验证码 */
export async function sendEmailCode(email: string): Promise<{ ttl: number; blocked?: boolean; devCode?: string }> {
  return request<{ ttl: number; blocked?: boolean; devCode?: string }>({
    url: '/auth/email/code/send',
    method: 'POST',
    data: { email },
  });
}

/** 邮箱验证码登录（自动注册）：成功后写入 Token */
export async function loginByEmailCode(email: string, code: string): Promise<LoginResult> {
  const data = await request<LoginResult>({
    url: '/auth/email/code/login',
    method: 'POST',
    data: { email, code },
  });
  setTokens(data.accessToken, data.refreshToken);
  return data;
}