/**
 * 职业规划扩展 hooks（P16 技能差距 / P17 学习资源 / P18 成长计划）
 * -------------------------------------------------------------
 * 无真实后端时用 mock 兜底（沿用项目既有 mock 模式）。TODO(blocked)：联调后删除 fallback。
 */
import { useQuery } from '@tanstack/react-query';
import { careerPlanApi } from '../api';
import type {
  SkillGapResult,
  LearningResource,
  GrowthPlan,
  ResourceType,
} from '../api/modules/career-plan.api';

export const careerPlanKeys = {
  skillGap: (careerId: string) => ['career-plan', 'skill-gap', careerId] as const,
  resources: (skill: string) => ['career-plan', 'resources', skill] as const,
  growth: ['career-plan', 'growth'] as const,
};

// ---------------- Mock 数据 ----------------
function mockSkillGap(careerId: string): SkillGapResult {
  return {
    careerId,
    careerTitle: '产品经理',
    items: [
      { skillName: '用户研究', requireLevel: 85, currentLevel: 55, gapLevel: 30, suggestion: '通过实战用户访谈与问卷分析补齐洞察能力。' },
      { skillName: '数据分析', requireLevel: 80, currentLevel: 60, gapLevel: 20, suggestion: '学习 SQL 与漏斗/留存分析，用数据支撑决策。' },
      { skillName: '需求管理', requireLevel: 90, currentLevel: 70, gapLevel: 20, suggestion: '练习需求优先级排序与 PRD 撰写。' },
      { skillName: '跨团队沟通', requireLevel: 85, currentLevel: 75, gapLevel: 10, suggestion: '主导一次跨职能项目以提升协调能力。' },
      { skillName: '商业思维', requireLevel: 75, currentLevel: 45, gapLevel: 30, suggestion: '拆解 3 个成熟产品的商业模式建立框架。' },
    ],
  };
}

function mockResources(): LearningResource[] {
  return [
    { id: 'r1', title: '《俞军产品方法论》', resourceType: 'book', skillTags: ['需求管理', '商业思维'], provider: '中信出版' },
    { id: 'r2', title: '数据分析实战训练营', resourceType: 'course', url: '#', skillTags: ['数据分析'], provider: '极客时间' },
    { id: 'r3', title: '用户访谈的 12 个技巧', resourceType: 'article', url: '#', skillTags: ['用户研究'], provider: '产品沉思录' },
    { id: 'r4', title: '从 0 到 1 搭建 PRD', resourceType: 'video', url: '#', skillTags: ['需求管理'], provider: 'B 站' },
    { id: 'r5', title: 'SQL 必知必会', resourceType: 'book', skillTags: ['数据分析'], provider: '人民邮电' },
    { id: 'r6', title: '商业模式画布精讲', resourceType: 'course', url: '#', skillTags: ['商业思维'], provider: 'Coursera' },
  ];
}

function mockGrowthPlans(): GrowthPlan[] {
  return [
    {
      id: 'gp1',
      title: '向产品经理转型 · 90 天计划',
      status: 1,
      progress: 40,
      careerTitle: '产品经理',
      createdAt: new Date().toISOString(),
      tasks: [
        { id: 't1', content: '完成用户研究课程并输出一份访谈报告', isDone: true, doneAt: new Date().toISOString() },
        { id: 't2', content: '读完《俞军产品方法论》并做读书笔记', isDone: true, doneAt: new Date().toISOString() },
        { id: 't3', content: '独立撰写一份完整 PRD', isDone: false },
        { id: 't4', content: '完成一次数据分析实战项目', isDone: false },
        { id: 't5', content: '拆解 3 个产品的商业模式', isDone: false },
      ],
    },
    {
      id: 'gp2',
      title: '数据能力强化',
      status: 1,
      progress: 20,
      careerTitle: '数据分析师',
      createdAt: new Date().toISOString(),
      tasks: [
        { id: 't6', content: '掌握 SQL 常用查询', isDone: true, doneAt: new Date().toISOString() },
        { id: 't7', content: '完成一份留存分析报告', isDone: false },
      ],
    },
  ];
}

// ---------------- Hooks ----------------
/** P16 技能差距分析（失败回退 mock） */
export function useSkillGap(careerId: string) {
  return useQuery<SkillGapResult>({
    queryKey: careerPlanKeys.skillGap(careerId || 'default'),
    enabled: true,
    queryFn: async () => {
      if (!careerId) return mockSkillGap('default');
      try {
        return await careerPlanApi.getSkillGap(careerId);
      } catch {
        return mockSkillGap(careerId);
      }
    },
  });
}

/** P17 学习资源推荐（失败回退 mock） */
export function useLearningResources(params: { skill?: string; careerId?: string; type?: ResourceType } = {}) {
  return useQuery<LearningResource[]>({
    queryKey: careerPlanKeys.resources(params.skill || 'all'),
    queryFn: async () => {
      try {
        const list = await careerPlanApi.listLearningResources(params);
        return list.length ? list : mockResources();
      } catch {
        return mockResources();
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** P18 成长计划 / 仪表盘（失败回退 mock） */
export function useGrowthPlans() {
  return useQuery<GrowthPlan[]>({
    queryKey: careerPlanKeys.growth,
    queryFn: async () => {
      try {
        const list = await careerPlanApi.getGrowthPlans();
        return list.length ? list : mockGrowthPlans();
      } catch {
        return mockGrowthPlans();
      }
    },
  });
}

export { mockSkillGap, mockResources, mockGrowthPlans };