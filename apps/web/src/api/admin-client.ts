/**
 * InnerQuest 运营后台 HTTP 客户端（scope=admin）
 * -------------------------------------------------------------
 * 与 C 端 client.ts 隔离：独立注入 admin token、独立 401 刷新（走
 * /admin/auth/refresh）、独立登录重定向（/admin/login）。
 * 复用统一响应契约 {code,message,data,traceId} 的解包逻辑。
 *
 * 降级兼容：
 *  - 501 NotImplemented（如话题管理 blocked）→ 抛 ApiError(code=501)，页面优雅提示；
 *  - 后端返回 source='mock'/'mysql' 降级数据 → 正常展示，由页面标注数据来源。
 */
import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';
import type { ApiResponse } from '@innerquest/shared';
import { BizCode, CommonCode } from '@innerquest/shared';
import { ApiError } from './client';
import {
  getAdminAccessToken,
  getAdminRefreshToken,
  setAdminTokens,
  clearAdminTokens,
} from './admin-token';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

function genTraceId(): string {
  return `adm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const adminHttp: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ---- 请求拦截器：注入 admin token 与 traceId ----
adminHttp.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAdminAccessToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  config.headers.set('X-Trace-Id', genTraceId());
  return config;
});

// ---- 401 刷新单飞 ----
let refreshing = false;
let waiters: Array<(token: string | null) => void> = [];

function onRefreshed(token: string | null): void {
  waiters.forEach((cb) => cb(token));
  waiters = [];
}

async function refreshAdminToken(): Promise<string | null> {
  const refreshToken = getAdminRefreshToken();
  if (!refreshToken) return null;
  try {
    const resp =await axios.post<
      ApiResponse<{ accessToken: string; refreshToken?: string }>
    >(`${BASE_URL}/admin/auth/refresh`, { refreshToken });
    const body = resp.data;
    if (body.code === BizCode.SUCCESS && body.data) {
      setAdminTokens(body.data.accessToken, body.data.refreshToken);
      return body.data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

function redirectToAdminLogin(): void {
  if (!window.location.pathname.startsWith('/admin/login')) {
    window.location.assign('/admin/login');
  }
}

// ---- 响应拦截器：解包契约 + 错误码分流 ----
adminHttp.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResponse<unknown>;
    if (body == null || typeof body.code !== 'number') {
      return response;
    }
    if (body.code === BizCode.SUCCESS) {
      response.data = body.data;
      return response;
    }
    throw new ApiError(body.code, body.message || '请求失败', body.traceId ?? '');
  },
  async (error: AxiosError<ApiResponse<unknown>>) => {
    const status = error.response?.status;
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;

    // 401：刷新 admin token 并重放
    if (status === 401 && original && !original._retried) {
      original._retried = true;
      if (refreshing) {
        const token = await new Promise<string | null>((resolve) => waiters.push(resolve));
        if (token) {
          original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
          return adminHttp(original);
        }
        clearAdminTokens();
        redirectToAdminLogin();
        return Promise.reject(new ApiError(CommonCode.UNAUTHORIZED, '后台登录已过期', ''));
      }
      refreshing = true;
      const newToken = await refreshAdminToken();
      refreshing = false;
      onRefreshed(newToken);
      if (newToken) {
        original.headers = { ...original.headers, Authorization: `Bearer ${newToken}` };
        return adminHttp(original);
      }
      clearAdminTokens();
      redirectToAdminLogin();
      return Promise.reject(new ApiError(CommonCode.UNAUTHORIZED, '后台登录已过期', ''));
    }

    // 501：blocked 未开放能力（如话题管理），页面需优雅提示
    if (status === 501) {
      const body = error.response?.data;
      return Promise.reject(
        new ApiError(501, body?.message || '该功能暂未开放', body?.traceId ?? ''),
      );
    }

    // 403：权限不足
    if (status === 403) {
      const body = error.response?.data;
      return Promise.reject(
        new ApiError(body?.code ?? 403, body?.message || '无权限操作', body?.traceId ?? ''),
      );
    }

    if (status === 429) {
      return Promise.reject(new ApiError(BizCode.RATE_LIMITED, '请求过于频繁，请稍后再试', ''));
    }

    const body = error.response?.data;
    if (body && typeof body.code === 'number') {
      return Promise.reject(new ApiError(body.code, body.message, body.traceId ?? ''));
    }
    return Promise.reject(
      new ApiError(CommonCode.INTERNAL_ERROR, error.message || '网络异常', ''),
    );
  },
);

/** 便捷方法：解包后直接返回业务数据类型 T（走 admin token 通道）。 */
export async function adminRequest<T>(config: AxiosRequestConfig): Promise<T> {
  const resp = await adminHttp.request<T>(config);
  return resp.data as T;
}