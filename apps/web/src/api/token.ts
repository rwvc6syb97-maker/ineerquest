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
  accessTokenCache = localStorage.getItem(ACCESS_KEY);
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