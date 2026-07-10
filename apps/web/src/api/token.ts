/**
 * Token 存储层
 * accessToken 存内存 + localStorage（页面刷新恢复），refreshToken 仅存 localStorage。
 * 后续可切换为 httpOnly Cookie 方案（blocked：需后端配合）。
 */
const ACCESS_KEY = 'iq_access_token';
const REFRESH_KEY = 'iq_refresh_token';

let accessTokenCache: string | null = null;

export function getAccessToken(): string | null {
  if (accessTokenCache) return accessTokenCache;
  const raw = localStorage.getItem(ACCESS_KEY);
  // 防御：过滤历史脏值（空串 / 字面量 "undefined"/"null"），避免误判为已登录导致
  // 未登录态右上角错误展示“个人中心”。命中脏值则清理并视为未登录。
  if (!raw || raw === 'undefined' || raw === 'null') {
    if (raw) localStorage.removeItem(ACCESS_KEY);
    accessTokenCache = null;
    return null;
  }
  accessTokenCache = raw;
  return accessTokenCache;
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken: string, refreshToken?: string): void {
  accessTokenCache = accessToken;
  localStorage.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) {
    localStorage.setItem(REFRESH_KEY, refreshToken);
  }
}

export function clearTokens(): void {
  accessTokenCache = null;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}