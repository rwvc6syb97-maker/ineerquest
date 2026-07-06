import { Outlet } from 'react-router-dom';

// 第二层（测评区）：MBTI 答题沉浸式布局（隐藏干扰元素，聚焦作答）
// 顶部细进度条占位使用品牌蓝浅色令牌，具体进度由各页内部呈现。
export function AssessmentLayout() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="h-1 w-full bg-brand-primary-100">
        {/* 顶部进度条占位（页面级进度见 QuizPage 内 sticky 进度条） */}
      </div>
      <main className="mx-auto max-w-2xl px-6">
        <Outlet />
      </main>
    </div>
  );
}