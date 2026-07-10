import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { ErrorBoundary } from '../components/system/ErrorBoundary';
import { useAuthStore } from '../stores/auth.store';

// 第一层：根布局（全局容器 / 主题 / 全站级 Provider 挂载点）
// 挂载全局 ErrorBoundary：运行时渲染错误统一兜底到 S02 通用错误页
export function RootLayout() {
  const fetchProfile = useAuthStore((s) => s.fetchProfile);

  // 应用入口校验登录态：有 token 则拉取用户资料，
  // 失效则由 fetchProfile 内部 clearTokens + user=null，避免右上角误显“个人中心”。
  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </div>
  );
}