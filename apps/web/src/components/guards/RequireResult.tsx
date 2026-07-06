/**
 * 路由守卫：要求存在测评结果
 * 用于报告页 P08：无结果 id 时（未完成测评）引导回测评引导页。
 * 结果 id 优先取路由参数，其次取草稿 store 中的 resultId。
 */
import { Navigate, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAssessmentStore } from '../../stores/assessment.store';

export function RequireResult({ children }: { children: ReactNode }) {
  const { id } = useParams();
  const resultId = useAssessmentStore((s) => s.resultId);

  if (!id && !resultId) {
    return <Navigate to="/assessment" replace />;
  }
  return <>{children}</>;
}