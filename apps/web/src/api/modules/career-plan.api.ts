/**
 * 职业规划扩展 API（P16 技能差距 / P17 学习资源 / P18 成长计划）
 * -------------------------------------------------------------
 * 对齐契约（《技术架构设计文档》§8）：
 *   GET /skills-gap/:careerId      技能差距分析（P16）
 *   GET /learning/resources        学习资源推荐（P17）
 *   GET /growth/plan               成长计划 / 仪表盘（P18）
 * 字段回溯《数据库设计文档》skill_gap_analysis / learning_resource / growth_plan(_task)。
 */
import { request } from '../client';

/** 技能差距项（对齐 skill_gap_analysis） */
export interface SkillGapItem {
  skillName: string;
  /** 目标要求等级 0-100 */
  requireLevel: number;
  /** 用户当前等级 0-100 */
  currentLevel: number;
  /** 差距值（require - current） */
  gapLevel: number;
  /** 提升建议 */
  suggestion?: string;
}

/** 技能差距分析结果 */
export interface SkillGapResult {
  careerId: string;
  careerTitle: string;
  items: SkillGapItem[];
}

/** 学习资源类型 */
export type ResourceType = 'course' | 'book' | 'article' | 'video';

/** 学习资源项（对齐 learning_resource） */
export interface LearningResource {
  id: string;
  title: string;
  resourceType: ResourceType;
  url?: string;
  /** 关联技能标签 */
  skillTags: string[];
  provider?: string;
}

/** 成长计划任务（对齐 growth_plan_task） */
export interface GrowthPlanTask {
  id: string;
  content: string;
  isDone: boolean;
  doneAt?: string;
}

/** 成长计划（对齐 growth_plan + tasks） */
export interface GrowthPlan {
  id: string;
  title: string;
  /** 状态：1 进行中 2 已完成 3 已放弃 */
  status: 1 | 2 | 3;
  /** 完成进度 0-100 */
  progress: number;
  careerTitle?: string;
  tasks: GrowthPlanTask[];
  createdAt: string;
}

/** P16 技能差距分析 */
export function getSkillGap(careerId: string): Promise<SkillGapResult> {
  return request<SkillGapResult>({
    url: `/skills-gap/${careerId}`,
    method: 'GET',
  });
}

/** P17 学习资源推荐（可按技能标签 / 职业过滤） */
export function listLearningResources(
  params: { skill?: string; careerId?: string; type?: ResourceType } = {},
): Promise<LearningResource[]> {
  return request<LearningResource[]>({
    url: '/learning/resources',
    method: 'GET',
    params,
  });
}

/** P18 成长计划 / 仪表盘数据 */
export function getGrowthPlans(): Promise<GrowthPlan[]> {
  return request<GrowthPlan[]>({ url: '/growth/plan', method: 'GET' });
}

/** 任务打卡（切换完成状态） */
export function toggleGrowthTask(
  planId: string,
  taskId: string,
  isDone: boolean,
): Promise<GrowthPlanTask> {
  return request<GrowthPlanTask>({
    url: `/growth/plan/${planId}/tasks/${taskId}`,
    method: 'PATCH',
    data: { isDone },
  });
}