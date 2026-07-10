/**
 * 职业规划扩展 API（P16 技能差距 / P17 学习资源 / P18 成长计划）
 * -------------------------------------------------------------
 * 对齐契约（裁定书 §13.5 A2/A3 路径迁移，后端 CareerController 权威）：
 *   GET /careers/:careerId/skill-gap   技能差距分析（P16，需登录）
 *   GET /careers/:careerId/resources   学习资源推荐（P17，游客可访，skill/type 可选 query）
 *   GET /growth/plan                   成长计划 / 仪表盘（P18）
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

/** P16 技能差距分析 GET /careers/:careerId/skill-gap */
export function getSkillGap(careerId: string): Promise<SkillGapResult> {
  return request<SkillGapResult>({
    url: `/careers/${careerId}/skill-gap`,
    method: 'GET',
  });
}

/** P17 学习资源推荐 GET /careers/:careerId/resources（skill/type 可选 query） */
export function listLearningResources(
  params: { careerId: string; skill?: string; type?: ResourceType },
): Promise<LearningResource[]> {
  const { careerId, ...query } = params;
  return request<LearningResource[]>({
    url: `/careers/${careerId}/resources`,
    method: 'GET',
    params: query,
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