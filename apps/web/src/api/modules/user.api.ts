/**
 * 用户服务 API（示例封装，供各业务模块参照）
 * 所有方法返回已解包的业务数据；失败以 ApiError 抛出。
 */
import { request } from '../client';
import { setTokens, clearTokens } from '../token';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

export interface UserProfile {
  id: string;
  nickname: string;
  email: string;
  avatar?: string;
}

/** 隐私设置（对齐后端契约：GET/PATCH /users/me/privacy） */
export interface PrivacySetting {
  /** 资料是否对外公开 */
  profilePublic: boolean;
  /** 是否允许基于测评的个性化推荐 */
  allowRecommend: boolean;
  /** 是否允许匿名数据用于产品改进 */
  shareAnonymous: boolean;
  /** 是否接收运营/成长提醒通知 */
  receiveNotifications: boolean;
}

/** 账户注销（冷静期）返回 */
export interface DeactivateResult {
  /** 注销正式生效时间（ISO 字符串） */
  effectiveAt: string;
  /** 冷静期天数，期间登录可撤销 */
  coolingDays: number;
}

/** 登录：成功后写入 Token */
export async function login(payload: LoginPayload): Promise<AuthResult> {
  const data = await request<AuthResult>({
    url: '/auth/login',
    method: 'POST',
    data: payload,
  });
  setTokens(data.accessToken, data.refreshToken);
  return data;
}

/** 登出：清空本地 Token */
export async function logout(): Promise<void> {
  await request<void>({ url: '/auth/logout', method: 'POST' }).catch(() => undefined);
  clearTokens();
}

/** 获取当前用户资料 */
export function getProfile(): Promise<UserProfile> {
  return request<UserProfile>({ url: '/users/me', method: 'GET' });
}

/** 获取隐私设置 */
export function getPrivacy(): Promise<PrivacySetting> {
  return request<PrivacySetting>({ url: '/users/me/privacy', method: 'GET' });
}

/** 更新隐私设置（部分字段） */
export function updatePrivacy(payload: Partial<PrivacySetting>): Promise<PrivacySetting> {
  return request<PrivacySetting>({
    url: '/users/me/privacy',
    method: 'PATCH',
    data: payload,
  });
}

/** 申请账户注销：进入冷静期，期间登录可撤销 */
export function deactivateAccount(reason: string): Promise<DeactivateResult> {
  return request<DeactivateResult>({
    url: '/users/me/deactivation',
    method: 'POST',
    data: { reason },
  });
}

/** 撤销注销申请：冷静期内可撤销 */
export function cancelDeactivation(): Promise<void> {
  return request<void>({
    url: '/users/me/deactivation',
    method: 'DELETE',
  });
}