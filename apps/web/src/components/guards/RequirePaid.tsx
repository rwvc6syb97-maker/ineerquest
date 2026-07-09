/**
 * 路由守卫：要求报告付费段已解锁（T2-08）
 * 报告任一付费 section 内容为空(content=null)视为未解锁，跳转套餐选择页并携带回跳地址。
 * 复用 useReport 以共享 React Query 缓存（key: report/detail/:id），
 * 解锁成功后 invalidate 该 key 即可自动放行。
 */
import { Navigate, useLocation, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useReport } from '../../hooks/useReport';

export function RequirePaid({ children }: { children: ReactNode }) {
  const { id = '' } = useParams();
  const location = useLocation();
  const { data, isLoading } = useReport(id);

  if (!id) {
    return <Navigate to="/assessment" replace />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center font-serif text-sm text-neutral-400">
        报告加载中…
      </div>
    );
  }

  // 存在未解锁付费段 → 引导购买（无数据也按未解锁处理）
  const locked = data?.sections?.some((s) => s.paid && s.content == null) ?? true;
  if (locked) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/pricing?reportId=${id}&redirect=${redirect}`} replace />;
  }

  return <>{children}</>;
}