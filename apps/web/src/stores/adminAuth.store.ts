/**
 * 运营后台认证状态（Zustand，scope=admin）
 * -------------------------------------------------------------
 * 与 C 端 useAuthStore 完全隔离：token 由 admin-token 层管理，
 * 本 store 持有登录管理员信息与权限点集合，供后台路由守卫、
 * 侧栏入口权限隐藏（hasPerm）使用。
 * 权限匹配复用 admin-token.hasAdminPermission（对齐后端 RBAC 通配规则）。
 */
import { create } from 'zustand';
import { adminAuthApi, ApiError } from '../api';
import type { AdminProfile, AdminLoginParams } from '../api/modules/admin-auth.api';
import {
  getAdminAccessToken,
  setAdminTokens,
  clearAdminTokens,
  setAdminPerms,
  getAdminPerms,
  hasAdminPermission,
} from '../api/admin-token';

/**
 * 后台 Mock 登录兜底（仅开发预览用，生产构建编译期剔除）。
 * 仅当 import.meta.env.DEV 为真且显式开启 VITE_AUTH_MOCK_MODE 时可用，
 * 用固定账号密码 admin / admin888 登录即�签发 admin token 与全通配权限点 `*`。
 * 生产构建下 import.meta.env.DEV 为编译期常量 false，整个 mock 分支被tree-shake 剔除。
 */
const ADMIN_MOCK_USERNAME = 'admin';
const ADMIN_MOCK_PASSWORD = 'admin888';

function isMockAuthEnabled(): boolean {
  // 编译期门控：生产构建 import.meta.env.DEV=false，此函数恒返回 false 并被静态剔除，
  // 生产产物中不存在任何 mock 登录路径，无法用假凭证进入后台。
  if (!import.meta.env.DEV) return false;
  const raw = import.meta.env.VITE_AUTH_MOCK_MODE;
  if (!raw) return false;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

interface AdminAuthState {
  admin: AdminProfile | null;
  loading: boolean;
  /** 是否已登录（基于 admin token） */
  isAuthenticated: () => boolean;
  /** 前端级权限判断（UI 入口隐藏用，最终以后端为准） */
  hasPerm: (need: string) => boolean;
  /** 后台登录：成功后写入双 token + perms + 管理员信息 */
  login: (params: AdminLoginParams) => Promise<void>;
  /** 后台登出：吊销 refresh + 清 token/状态 */
  logout: () => Promise<void>;
  /** 页面刷新后从本地 perms 恢复登录态（无 profile 接口时的兜底） */
  hydrate: () => void;
  setAdmin: (admin: AdminProfile | null) => void;
}

export const useAdminAuthStore = create<AdminAuthState>((set, get) => ({
  admin: null,
  loading: false,

  isAuthenticated: () => !!getAdminAccessToken(),

  hasPerm: (need) => {
    const perms = get().admin?.perms ?? getAdminPerms();
    return hasAdminPermission(need, perms);
  },

  login: async (params) => {
    set({ loading: true });
    try {
      // Mock 模式：固定账号密码直接签发 admin 登录态（仅开发预览，生产构建编译期剔除）
      if (import.meta.env.DEV && isMockAuthEnabled()) {
        if (
          params.username === ADMIN_MOCK_USERNAME &&
          params.password === ADMIN_MOCK_PASSWORD
        ) {
          setAdminTokens('mock_admin_access_token', 'mock_admin_refresh_token');
          setAdminPerms(['*']);
          set({
            admin: {
              id: 'mock-admin',
              nickname: '超级管理员(Mock)',
              role: 3,
              adminRole: 'super_admin',
              perms: ['*'],
            },
          });
          return;
        }
        throw new ApiError(0, '账号或密码错误（Mock 模式：admin / admin888）', '');
      }

      const res = await adminAuthApi.login(params);
      setAdminTokens(res.accessToken, res.refreshToken);
      setAdminPerms(res.admin.perms ?? []);
      set({ admin: res.admin });
    } finally {
      set({ loading: false });
    }
  },

  logout: async () => {
    await adminAuthApi.logout().catch(() => undefined);
    clearAdminTokens();
    set({ admin: null });
  },

  hydrate: () => {
    // 无 admin profile 接口，刷新后仅从本地 perms 恢复权限用于 UI 渲染；
    // 若 token 已失效，首个受保护请求 401 会触发跳转登录。
    if (!getAdminAccessToken()) {
      set({ admin: null });
      return;
    }
    const perms = getAdminPerms();
    set((s) =>
      s.admin
        ? s
        : {
            admin: {
              id: '',
              nickname: '',
              role: 0,
              adminRole: '',
              perms,
            },
          },
    );
  },

  setAdmin: (admin) => set({ admin }),
}));