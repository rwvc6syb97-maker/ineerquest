/**
 * 报告相关 React Query hooks
 * 无真实后端时用 mock 报告兜底。TODO(blocked)：联调后删除 fallback。
 */
import { useQuery, useMutation } from '@tanstack/react-query';
import { reportApi } from '../api';
import type { Report } from '../api/modules/report.api';
import { familyOf, FAMILY_LABEL } from '../theme/tokens';

export const reportKeys = {
  detail: (id: string) => ['report', 'detail', id] as const,
  list: ['report', 'list'] as const,
};

/** 无后端兜底：由 recordId 关联的本地 MBTI 生成 mock 报告 */
function mockReport(id: string): Report {
  const mbti = localStorage.getItem(`iq_result_${id}`) || 'INTJ';
  const family = familyOf(mbti);
  return {
    id,
    recordId: id,
    mbtiType: mbti,
    family,
    summary: `你是「${mbti}」，属于${FAMILY_LABEL[family]}族群。你善于用独特的视角理解世界，并在擅长的领域持续深耕。`,
    sections: [
      { key: 'strength', title: '核心优势', content: '结构化思考、专注力强、对复杂问题有耐心。', locked: false },
      { key: 'blindspot', title: '成长盲点', content: '可能忽略他人情绪信号，需主动沟通表达。', locked: false },
      { key: 'career', title: '职业倾向（付费）', content: '', locked: true },
      { key: 'relation', title: '关系模式（付费）', content: '', locked: true },
    ],
    dimensions: [
      { dimension: 'EI', left: '外向 E', right: '内向 I', score: 68 },
      { dimension: 'SN', left: '实感 S', right: '直觉 N', score: 74 },
      { dimension: 'TF', left: '思考 T', right: '情感 F', score: 32 },
      { dimension: 'JP', left: '判断 J', right: '知觉 P', score: 61 },
    ],
    createdAt: new Date().toISOString(),
  };
}

/** 报告详情（先按 recordId 生成/获取） */
export function useReport(id: string) {
  return useQuery<Report>({
    queryKey: reportKeys.detail(id),
    enabled: !!id,
    queryFn: async () => {
      try {
        return await reportApi.getReport(id);
      } catch {
        try {
          return await reportApi.createReport(id);
        } catch {
          return mockReport(id); // 无后端兜底
        }
      }
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

/** 生成分享海报 */
export function useShareReport() {
  return useMutation({
    mutationFn: (id: string) => reportApi.shareReport(id),
  });
}

export { mockReport };