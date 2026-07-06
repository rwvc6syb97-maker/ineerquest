/**
 * InnerQuest 前端 HTTP 客户端
 * 基于 axios，统一处理：
 *  - 请求：注入 Authorization Bearer、traceId
 *  - 响应：解包 {code,message,data,traceId} 统一契约
 *  - 401：自动刷新 Token 并重放请求（单飞去重）
 *  - 429：限流提示（BizCode.RATE_LIMITED）
 *  - 业务错误码：抛出 ApiError 供上层捕获
 * 对齐《技术架构设计文档》§8 API 前缀 /api/v1 与统一响应契约。
 */
import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';
import type { ApiResponse } from '@innerquest/shared';
import { BizCode, CommonCode } from '@innerquest/shared';
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './token';

/** 业务错误：携带业务码与 traceId，供 UI 层区分处理 */
export class ApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly traceId: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

/** 简易 traceId 生成（前端侧，后端 Trace 中间件会以自身为准） */
function genTraceId(): string {
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ---- 请求拦截器：注入 Token 与 traceId ----
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  config.headers.set('X-Trace-Id', genTraceId());
  return config;
});

// ---- 401 刷新单飞：避免并发请求重复刷新 ----
let refreshing = false;
let waiters: Array<(token: string | null) => void> = [];

function onRefreshed(token: string | null): void {
  waiters.forEach((cb) => cb(token));
  waiters = [];
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    // 使用裸 axios 避免触发本实例拦截器造成递归
    const resp = await axios.post<ApiResponse<{ accessToken: string; refreshToken?: string }>>(
      `${BASE_URL}/auth/refresh`,
      { refreshToken },
    );
    const body = resp.data;
    if (body.code === BizCode.SUCCESS && body.data) {
      setTokens(body.data.accessToken, body.data.refreshToken);
      return body.data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

// ---- 响应拦截器：解包契约 + 错误码分流 ----
http.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResponse<unknown>;
    // 兼容非标准响应（如文件流）：无 code 字段直接透传
    if (body == null || typeof body.code !== 'number') {
      return response;
    }
    if (body.code === BizCode.SUCCESS) {
      // 解包 data 到 response.data，供上层直接拿业务数据
      response.data = body.data;
      return response;
    }
    // 业务失败：统一抛 ApiError
    throw new ApiError(body.code, body.message || '请求失败', body.traceId ?? '');
  },
  async (error: AxiosError<ApiResponse<unknown>>) => {
    const status = error.response?.status;
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;

    // 401：尝试刷新 Token 并重放
    if (status === 401 && original && !original._retried) {
      original._retried = true;
      if (refreshing) {
        // 等待正在进行的刷新
        const token = await new Promise<string | null>((resolve) => waiters.push(resolve));
        if (token) {
          original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
          return http(original);
        }
        clearTokens();
        redirectToLogin();
        return Promise.reject(
          new ApiError(CommonCode.UNAUTHORIZED, '登录已过期', ''),
        );
      }

      refreshing = true;
      const newToken = await refreshAccessToken();
      refreshing = false;
      onRefreshed(newToken);

      if (newToken) {
        original.headers = { ...original.headers, Authorization: `Bearer ${newToken}` };
        return http(original);
      }
      clearTokens();
      redirectToLogin();
      return Promise.reject(new ApiError(CommonCode.UNAUTHORIZED, '登录已过期', ''));
    }

    // 429：限流
    if (status === 429) {
      return Promise.reject(
        new ApiError(BizCode.RATE_LIMITED, '请求过于频繁，请稍后再试', ''),
      );
    }

    // 其余：优先用后端业务码，否则用 HTTP 状态兜底
    const body = error.response?.data;
    if (body && typeof body.code === 'number') {
      return Promise.reject(new ApiError(body.code, body.message, body.traceId ?? ''));
    }
    return Promise.reject(
      new ApiError(CommonCode.INTERNAL_ERROR, error.message || '网络异常', ''),
    );
  },
);

function redirectToLogin(): void {
  if (!window.location.pathname.startsWith('/auth/login')) {
    window.location.replace('/auth/login');
  }
}

/** 便捷方法：解包后直接返回业务数据类型 T */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const resp = await http.request<T>(config);
  return resp.data as T;
}