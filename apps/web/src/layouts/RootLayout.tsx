import { Outlet } from 'react-router-dom';
import { ErrorBoundary } from '../components/system/ErrorBoundary';

// 第一层：根布局（全局容器 / 主题 / 全站级 Provider 挂载点）
// 挂载全局 ErrorBoundary：运行时渲染错误统一兜底到 S02 通用错误页
export function RootLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </div>
  );
}