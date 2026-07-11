/**
 * 报告相关 React Query hooks
 * 直接消费后端 GET /reports/:id 概览 v2.1 出参，不做前端反解、不做 mock 兜底。
 * 契约不一致时暴露真实错误态（由页面 isLoading / isError 呈现），避免静默降级白屏。
 */
import { useQuery, useMutation } from '@tanstack/react-query';
import { reportApi } from '../api';
import type { Report } from '../api/modules/report.api';

export const reportKeys = {
  detail: (id: string) => ['report', 'detail', id] as const,
  list: ['report', 'list'] as const,
};

/**
 * 报告详情
 * 先尝试获取已存在报告；若报告不存在则按 recordId 触发生成免费预览段。
 * 两者均失败时抛出真实错误，交由页面错误态展示（不再回退 mock）。
 */
export function useReport(id: string, options?: { poll?: boolean }) {
  const poll = options?.poll ?? false;
  return useQuery<Report>({
    queryKey: reportKeys.detail(id),
    enabled: !!id,
    queryFn: async () => {
      try {
        return await reportApi.getReport(id);
      } catch {
        // 报告尚未生成：按 recordId 生成免费预览段（失败则向上抛出真实错误）
        return await reportApi.createReport(id);
      }
    },
    // 深度生成为后端异步任务（LLM 逐段写回，耗时数秒~十几秒）。
    // 触发生成后开启轮询，直到 generateStatus 落定为 done/failed，避免用户误以为“点了没反应”。
    refetchInterval: (query) => {
      if (!poll) return false;
      const status = query.state.data?.generateStatus;
      return status === 'generating' || status === 'pending' ? 3000 : false;
    },
  });
}

/** 我的报告列表 */
export function useReportList() {
  return useQuery({
    queryKey: reportKeys.list,
    queryFn: () => reportApi.listReports(1, 20),
  });
}

/** 报告章节列表（§6.1 #2） */
export function useSections(id: string) {
  return useQuery({
    queryKey: ['report', 'sections', id],
    enabled: !!id,
    queryFn: () => reportApi.getSections(id),
  });
}

/** 章节详情（§6.1 #3） */
export function useSectionDetail(id: string, sectionKey: string) {
  return useQuery({
    queryKey: ['report', 'section', id, sectionKey],
    enabled: !!id && !!sectionKey,
    queryFn: () => reportApi.getSectionDetail(id, sectionKey),
  });
}

/** 触发 LLM 深度生成（§6.1 #4） */
export function useGenerateDeepContent() {
  return useMutation({
    mutationFn: ({ id, sections }: { id: string; sections?: string[] }) =>
      reportApi.generateDeepContent(id, sections),
  });
}

/** 生成分享海报 */
export function useShareReport() {
  return useMutation({
    mutationFn: (id: string) => reportApi.shareReport(id),
  });
}