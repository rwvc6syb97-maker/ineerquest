/**
 * 全局认证状态（Zustand）
 * 职责：持有当前登录用户与登录态，供路由守卫/头部/权限判断使用。
 * Token 由 api/token 层管理，本 store 只保存用户信息与派生登录态。
 * 契约 v2.0：登录接口返回 { accessToken, refreshToken, user, isNewUser? }，
 * 直接采用后端返回的 user；缺失时降级调用 userApi.getProfile()。
 * 权限/有效期等业务判断全部交由后端，前端不做 mock 兜底。
 */
import { create } from 'zustand';
import { userApi, authApi } from '../api';
import type { UserProfile } from '../api/modules/user.api';
import { getAccessToken, clearTokens } from '../api/token';

/**
 * Mock 认证开关（已废弃，恒为 false）。
 * 契约 v2.0 联调阶段禁用一切 mock 通路，避免掩盖前后端契约问题。
 * 保留导出仅为兼容既有引用（如 useAssessment），后续应逐步移除调用点。
 */
export function isMockAuthEnabled(): boolean {
  return false;
}

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  /** 是否已登录（基于内存/本地 Token） */
  isAuthenticated: () => boolean;
  /** 拉取当前用户资料（应用初始化时调用） */
  fetchProfile: () => Promise<void>;
  /** 邮箱+密码登录 */
  login: (email: string, password: string) => Promise<void>;
  /** 短信验证码登录：返回是否为新注册用户（供页面决定是否引导选套餐） */
  loginBySms: (phone: string, code: string) => Promise<boolean>;
  /** 邮箱注册 */
  registerByEmail: (email: string, password: string, nickname?: string) => Promise<void>;
  /** 邮箱+密码登录 */
  loginByEmail: (email: string, password: string) => Promise<void>;
  /** 邮箱验证码登录（自动注册） */
  loginByEmailCode: (email: string, code: string) => Promise<boolean>;
  /** 登出：清 Token + 清状态 */
  logout: () => Promise<void>;
  setUser: (user: UserProfile | null) => void;
}

/** 兜底：登录返回体未携带完整 user 时，拉取用户资料。data 可选判空。 */
async function resolveUser(
  returned?: Partial<UserProfile> & { id?: string } | null,
): Promise<UserProfile | null> {
  if (returned && returned.id) {
    // 归一化为严格 UserProfile：email 缺失补空串，交由后续 fetchProfile 修正
    return {
      id: returned.id,
      nickname: returned.nickname ?? '',
      email: returned.email ?? '',
      avatar: returned.avatar,
    };
  }
  try {
    return await userApi.getProfile();
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,

  isAuthenticated: () => !!getAccessToken(),

  fetchProfile: async () => {
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
    const res = await authApi.loginByEmail(email, password);
    const user = await resolveUser(res?.user);
    set({ user });
  },

  loginBySms: async (phone, code) => {
    const res = await authApi.loginBySms(phone, code);
    const user = await resolveUser(res?.user);
    set({ user });
    return !!res?.isNewUser;
  },

  registerByEmail: async (email, password, nickname) => {
    const res = await authApi.registerByEmail(email, password, nickname);
    const user = await resolveUser(res?.user);
    set({ user });
  },

  loginByEmail: async (email, password) => {
    const res = await authApi.loginByEmail(email, password);
    const user = await resolveUser(res?.user);
    set({ user });
  },

  loginByEmailCode: async (email, code) => {
    const res = await authApi.loginByEmailCode(email, code);
    const user = await resolveUser(res?.user);
    set({ user });
    return !!res?.isNewUser;
  },

  logout: async () => {
    await authApi.logout().catch(() => userApi.logout());
    set({ user: null });
  },

  setUser: (user) => set({ user }),
}));