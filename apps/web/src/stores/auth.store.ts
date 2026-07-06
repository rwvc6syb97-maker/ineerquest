/**
 * 全局认证状态（Zustand）
 * 职责：持有当前登录用户与登录态，供路由守卫/头部/权限判断使用。
 * Token 由 api/token 层管理，本 store 只保存用户信息与派生登录态。
 */
import { create } from 'zustand';
import { userApi, authApi } from '../api';
import type { UserProfile } from '../api/modules/user.api';
import { getAccessToken, clearTokens, setTokens } from '../api/token';
import { setAdminTokens, setAdminPerms, clearAdminTokens } from '../api/admin-token';

const MOCK_USER_KEY = 'iq_mock_user';

/**
 * 内置后台测试账号：短信登录该账号（Mock 模式下）时，
 * 顺带签发 admin token 与全通配权限点 `*`，登录后即可直接进入 /admin 后台。
 */
const ADMIN_TEST_PHONE = '13800000000';
const ADMIN_TEST_CODE = '888888';

/** 为测试账号写入 admin 登录态（token + 全权限），使其可直接进入后台。 */
function grantMockAdmin(): void {
  setAdminTokens('mock_admin_access_token', 'mock_admin_refresh_token');
  setAdminPerms(['*']);
}

export function isMockAuthEnabled(): boolean {
  const raw = import.meta.env.VITE_AUTH_MOCK_MODE;
  if (!raw) return false;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function buildMockUser(phone = '13800000000'): UserProfile {
  return {
    id: `mock-${phone}`,
    nickname: 'Mock用户',
    email: `mock_${phone}@innerquest.local`,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=innerquest-mock',
  };
}

function saveMockUser(user: UserProfile): void {
  localStorage.setItem(MOCK_USER_KEY, JSON.stringify(user));
}

function loadMockUser(): UserProfile | null {
  const raw = localStorage.getItem(MOCK_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    localStorage.removeItem(MOCK_USER_KEY);
    return null;
  }
}

function clearMockUser(): void {
  localStorage.removeItem(MOCK_USER_KEY);
}

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  /** 是否已登录（基于内存/本地 Token） */
  isAuthenticated: () => boolean;
  /** 拉取当前用户资料（应用初始化时调用） */
  fetchProfile: () => Promise<void>;
  /** 登录：委托 userApi.login，成功后写入用户信息 */
  login: (email: string, password: string) => Promise<void>;
  /** 短信验证码登录 */
  loginBySms: (phone: string, code: string) => Promise<void>;
  /** 邮箱注册 */
  registerByEmail: (email: string, password: string, nickname?: string) => Promise<void>;
  /** 邮箱+密码登录 */
  loginByEmail: (email: string, password: string) => Promise<void>;
  /** 登出：清 Token + 清状态 */
  logout: () => Promise<void>;
  setUser: (user: UserProfile | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,

  isAuthenticated: () => {
    const hasToken = !!getAccessToken();
    if (hasToken) return true;
    return isMockAuthEnabled() && !!loadMockUser();
  },

  fetchProfile: async () => {
    const mockEnabled = isMockAuthEnabled();
    if (mockEnabled) {
      const mockUser = loadMockUser();
      if (mockUser) {
        set({ user: mockUser });
      }
      return;
    }

    if (!getAccessToken()) return;
    set({ loading: true });
    try {
      const user = await userApi.getProfile();
      set({ user });
    } catch {
      clearTokens();
      set({ user: null });
    } finally {
      set({ loading: false });
    }
  },

  login: async (email, password) => {
    if (isMockAuthEnabled()) {
      const user = buildMockUser();
      setTokens('mock_access_token', 'mock_refresh_token');
      saveMockUser(user);
      set({ user });
      return;
    }

    await authApi.loginByEmail(email, password);
    const user = await userApi.getProfile();
    set({ user });
  },

  loginBySms: async (phone, code) => {
    if (isMockAuthEnabled()) {
      const user = buildMockUser(phone);
      setTokens('mock_access_token', 'mock_refresh_token');
      saveMockUser(user);
      // 内置后台测试账号：同时授予 admin 登录态，可直接进入 /admin 后台
      if (phone === ADMIN_TEST_PHONE && code === ADMIN_TEST_CODE) {
        grantMockAdmin();
      }
      set({ user });
      return;
    }

    await authApi.loginBySms(phone, code);
    const user = await userApi.getProfile();
    set({ user });
  },

  registerByEmail: async (email, password, nickname) => {
    if (isMockAuthEnabled()) {
      const user = buildMockUser(email);
      setTokens('mock_access_token', 'mock_refresh_token');
      saveMockUser(user);
      set({ user });
      return;
    }

    await authApi.registerByEmail(email, password, nickname);
    const user = await userApi.getProfile();
    set({ user });
  },

  loginByEmail: async (email, password) => {
    if (isMockAuthEnabled()) {
      const user = buildMockUser(email);
      setTokens('mock_access_token', 'mock_refresh_token');
      saveMockUser(user);
      set({ user });
      return;
    }

    await authApi.loginByEmail(email, password);
    const user = await userApi.getProfile();
    set({ user });
  },

  logout: async () => {
    if (isMockAuthEnabled()) {
      clearTokens();
      clearMockUser();
      clearAdminTokens();
      set({ user: null });
      return;
    }

    await authApi.logout().catch(() => userApi.logout());
    set({ user: null });
  },

  setUser: (user) => {
    if (isMockAuthEnabled()) {
      if (user) saveMockUser(user);
      else clearMockUser();
    }
    set({ user });
  },
}));