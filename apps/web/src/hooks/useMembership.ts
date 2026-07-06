/**
 * 会员套餐 React Query hooks（T2-11）
 * 无真实后端时用 mock 套餐兜底。TODO(blocked)：联调后删除 fallback。
 */
import { useQuery } from '@tanstack/react-query';
import { membershipApi } from '../api';
import type { MembershipPlan } from '../api/modules/membership.api';

export const membershipKeys = {
  plans: ['membership', 'plans'] as const,
  plan: (code: string) => ['membership', 'plan', code] as const,
};

/** 无后端兜底套餐（价格单位：分，对齐 seed.ts 的 4 个套餐） */
function mockPlans(): MembershipPlan[] {
  return [
    {
      id: 'mock-plan-free',
      code: 'free',
      name: '免费入门',
      subtitle: '开启你的 MBTI 探索之旅',
      price: 0,
      originalPrice: null,
      durationDays: null,
      planType: 2,
      benefits: ['基础 MBTI 测评（40 题标准版）', '简要结果概览', 'TOP 5 职业匹配推荐', '1 次 AI 对话（限 5 轮）'],
      sortOrder: 1,
      isRecommended: 0,
    },
    {
      id: 'mock-plan-pro-monthly',
      code: 'pro-monthly',
      name: 'Pro 月度',
      subtitle: '解锁深度报告与职业规划 · 月付灵活',
      price: 4900,
      originalPrice: 6900,
      durationDays: 30,
      planType: 2,
      benefits: ['深度 MBTI 报告（4 大维度详解）', 'TOP 10 职业匹配 + 技能差距分析', '无限 AI 对话（每会话 50 轮）', '职业路线图与学习资源推荐', '报告 PDF 导出与分享', '历史报告永久保存'],
      sortOrder: 2,
      isRecommended: 0,
    },
    {
      id: 'mock-plan-pro-yearly',
      code: 'pro-yearly',
      name: 'Pro 年度',
      subtitle: '完整成长方案 · 性价比之选',
      price: 29900,
      originalPrice: 58800,
      durationDays: 365,
      planType: 2,
      benefits: ['Pro 月度全部权益', '优先体验新功能与 AI 模型', '专属 MBTI 类型社群', '年度成长复盘报告', '辅导咨询 9 折权益'],
      sortOrder: 3,
      isRecommended: 1,
    },
    {
      id: 'mock-plan-coaching',
      code: 'coaching-single',
      name: '1 对 1 辅导（单次）',
      subtitle: '与认证辅导师 60 分钟深度对话',
      price: 29900,
      originalPrice: null,
      durationDays: null,
      planType: 1,
      benefits: ['60 分钟线上视频/文字咨询', '辅导前个人画像分析', '咨询后成长建议摘要', '7 天内查看回放记录'],
      sortOrder: 4,
      isRecommended: 0,
    },
  ];
}

/** 上架套餐列表 */
export function usePlans() {
  return useQuery<MembershipPlan[]>({
    queryKey: membershipKeys.plans,
    queryFn: async () => {
      try {
        const list = await membershipApi.listPlans();
        return list.length > 0 ? list : mockPlans();
      } catch {
        return mockPlans(); // 无后端兜底
      }
    },
  });
}

/** 套餐详情 */
export function usePlan(code: string) {
  return useQuery<MembershipPlan | undefined>({
    queryKey: membershipKeys.plan(code),
    enabled: !!code,
    queryFn: async () => {
      try {
        return await membershipApi.getPlan(code);
      } catch {
        return mockPlans().find((p) => p.code === code); // 无后端兜底
      }
    },
  });
}