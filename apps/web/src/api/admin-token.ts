/**
 * 运营后台 Admin Token 存储层（区别于 C 端 user token）
 * -------------------------------------------------------------
 * 后端 `/admin/auth/login` 签发 scope=admin 双 Token，与 C 端 user token
 * 完全隔离：独立 localStorage key + 独立内存缓存 + 独立请求头注入。
 * 同时缓存登录管理员的权限点集合 perms（token.perms 展开值），供前端级
 * UI 权限隐藏（无权限不渲染入口）。
 */
const ADMIN_ACCESS_KEY = 'iq_admin_access_token';
const ADMIN_REFRESH_KEY = 'iq_admin_refresh_token';
const ADMIN_PERMS_KEY = 'iq_admin_perms';

let adminAccessCache: string | null = null;

export function getAdminAccessToken(): string | null {
  if (adminAccessCache) return adminAccessCache;
  adminAccessCache = localStorage.getItem(ADMIN_ACCESS_KEY);
  return adminAccessCache;
}

export function getAdminRefreshToken(): string | null {
  return localStorage.getItem(ADMIN_REFRESH_KEY);
}

export function setAdminTokens(accessToken: string, refreshToken?: string): void {
  adminAccessCache = accessToken;
  localStorage.setItem(ADMIN_ACCESS_KEY, accessToken);
  if (refreshToken) {
    localStorage.setItem(ADMIN_REFRESH_KEY, refreshToken);
  }
}

export function clearAdminTokens(): void {
  adminAccessCache = null;
  localStorage.removeItem(ADMIN_ACCESS_KEY);
  localStorage.removeItem(ADMIN_REFRESH_KEY);
  localStorage.removeItem(ADMIN_PERMS_KEY);
}

/** 保存登录管理员权限点集合（含通配 `*` / `ns:*`）。 */
export function setAdminPerms(perms: string[]): void {
  localStorage.setItem(ADMIN_PERMS_KEY, JSON.stringify(perms ?? []));
}

export function getAdminPerms(): string[] {
  try {
    const raw = localStorage.getItem(ADMIN_PERMS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * 前端级权限点匹配（与后端 admin-rbac.constants.hasPermission 规则对齐）：
 *  1. owned 含 `*` → 命中（超级管理员）
 *  2. 精确相等命中
 *  3. 前缀通配 `ns:*` 且 need 以 `ns:` 开头 → 命中
 * 仅用于 UI 入口隐藏，最终鉴权仍以后端为准。
 */
export function hasAdminPermission(need: string, owned = getAdminPerms()): boolean {
  if (!need) return true;
  if (owned.includes('*')) return true;
  if (owned.includes(need)) return true;
  return owned.some((p) => {
    if (!p.endsWith(':*')) return false;
    const ns = p.slice(0, -1); // 'question:*' -> 'question:'
    return need.startsWith(ns);
  });
}