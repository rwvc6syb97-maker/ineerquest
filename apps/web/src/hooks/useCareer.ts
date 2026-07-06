/**
 * 职业相关 React Query hooks
 * 无真实后端时用 mock 职业数据兜底。TODO(blocked)：联调后删除 fallback。
 */
import { useQuery } from '@tanstack/react-query';
import { careerApi } from '../api';
import type { CareerCard, CareerDetail } from '../api/modules/career.api';

export const careerKeys = {
  recommend: (reportId: string) => ['career', 'recommend', reportId] as const,
  detail: (id: string) => ['career', 'detail', id] as const,
};

const MOCK_CAREERS: CareerCard[] = [
  { id: 'c1', title: '产品经理', category: '互联网', matchScore: 92, summary: '洞察用户需求，定义产品方向。', salaryRange: '20k-45k', tags: ['策略', '沟通', '数据'] },
  { id: 'c2', title: '数据分析师', category: '数据', matchScore: 88, summary: '用数据驱动决策与增长。', salaryRange: '18k-38k', tags: ['SQL', '建模', '洞察'] },
  { id: 'c3', title: 'UX 设计师', category: '设计', matchScore: 84, summary: '打磨体验，连接人与产品。', salaryRange: '15k-35k', tags: ['交互', '同理心', '原型'] },
  { id: 'c4', title: '战略咨询顾问', category: '咨询', matchScore: 81, summary: '拆解复杂商业问题并给出方案。', salaryRange: '25k-60k', tags: ['框架', '逻辑', '表达'] },
  { id: 'c5', title: '软件工程师', category: '技术', matchScore: 79, summary: '构建可靠的系统与工具。', salaryRange: '20k-50k', tags: ['编程', '架构', '专注'] },
  { id: 'c6', title: '增长运营', category: '运营', matchScore: 75, summary: '设计增长实验，放大规模。', salaryRange: '15k-32k', tags: ['实验', '渠道', '复盘'] },
];

function mockDetail(id: string): CareerDetail {
  const base = MOCK_CAREERS.find((c) => c.id === id) || MOCK_CAREERS[0];
  return {
    ...base,
    responsibilities: ['明确目标与优先级', '协调跨职能团队推进', '基于数据迭代方案', '对结果负责并复盘'],
    skills: [
      { name: '结构化思考', level: 90 },
      { name: '沟通协作', level: 80 },
      { name: '数据分析', level: 75 },
      { name: '执行落地', level: 85 },
    ],
    salary: { junior: '15k-22k', middle: '25k-38k', senior: '40k-60k' },
    growthPath: ['初级', '资深', '专家 / 负责人', '总监'],
    fitTypes: ['INTJ', 'ENTJ', 'INTP', 'ENFP'],
  };
}

/** MBTI 匹配推荐 TOP（按 reportId 关联报告，失败回退 mock） */
export function useRecommendCareers(reportId: string) {
  return useQuery<CareerCard[]>({
    queryKey: careerKeys.recommend(reportId || 'all'),
    queryFn: async () => {
      if (!reportId) return MOCK_CAREERS; // 无报告直接兜底
      try {
        const list = await careerApi.recommendCareers(reportId);
        return list.length ? list : MOCK_CAREERS;
      } catch {
        return MOCK_CAREERS; // 无后端兜底
      }
    },
    staleTime: 10 * 60 * 1000,
  });
}

/** 职业详情（失败回退 mock） */
export function useCareerDetail(id: string) {
  return useQuery<CareerDetail>({
    queryKey: careerKeys.detail(id),
    enabled: !!id,
    queryFn: async () => {
      try {
        return await careerApi.getCareer(id);
      } catch {
        return mockDetail(id); // 无后端兜底
      }
    },
  });
}

export { MOCK_CAREERS };