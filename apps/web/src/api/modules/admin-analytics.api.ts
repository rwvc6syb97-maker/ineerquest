/**
 * 运营后台 - 数据看板 API（T4-17 / P35）
 * -------------------------------------------------------------
 * 对齐后端 ops/analytics controller（权限 analytics:read，controller 级）：
 *   GET /admin/analytics/overview                 核心指标概览
 *   GET /admin/analytics/growth?days=             用户增长曲线
 *   GET /admin/analytics/funnel?days=             测评转化漏斗（三步）
 *   GET /admin/analytics/module-usage?days=       功能模块使用占比
 *   GET /admin/analytics/module-trend?days=       功能模块使用趋势
 *   GET /admin/analytics/assessment-rate?days=    测评完成率
 *
 * 数据源降级：后端返回 source 字段（clickhouse|mysql|mock），页面据此标注。
 * 全部走 adminRequest（注入 admin token，自动解包契约）。
 */
import { adminRequest } from '../admin-client';

/** 数据来源（用于前端标注降级状态） */
export type AnalyticsSource = 'clickhouse' | 'mysql' | 'mock';

/** 核心指标概览（免费化后契约 §5.1，移除付费/GMV 字段） */
export interface AnalyticsOverview {
  source: AnalyticsSource;
  /** 累计用户数 */
  totalUsers: number;
  /** 近 7 日新增用户数 */
  newUsers7d: number;
  /** 测评数 */
  assessmentCount: number;
  /** 报告生成数 */
  reportCount: number;
  /** AI 模块调用合计（careerPlan+resume+interview+aiChat） */
  aiCallCount: number;
}

/** 单日计数点 */
export interface DailyCountPoint {
  date: string;
  count: number;
}

/** 用户增长曲线 */
export interface AnalyticsGrowth {
  source: AnalyticsSource;
  days: number;
  series: DailyCountPoint[];
}

/** 漏斗步骤（三步，免费化后去 report_unlock） */
export type FunnelStep =
  | 'assessment_start'
  | 'assessment_submit'
  | 'report_generate';

/** 漏斗节点 */
export interface FunnelNode {
  step: FunnelStep;
  count: number;
}

/** 测评转化漏斗 */
export interface AnalyticsFunnel {
  source: AnalyticsSource;
  days: number;
  funnel: FunnelNode[];
}

/** 功能模块使用占比条目（§5.4） */
export interface ModuleUsageItem {
  moduleKey: string;
  moduleName: string;
  count: number;
  /** 占比 count/total，保留 4 位小数（total=0 时为 0） */
  ratio: number;
}

/** 功能模块使用占比 */
export interface AnalyticsModuleUsage {
  source: AnalyticsSource;
  days: number;
  total: number;
  items: ModuleUsageItem[];
}

/** 模块使用趋势单日点（date + 各 moduleKey 计数） */
export interface ModuleTrendPoint {
  date: string;
  [moduleKey: string]: string | number;
}

/** 功能模块使用趋势（§5.5） */
export interface AnalyticsModuleTrend {
  source: AnalyticsSource;
  days: number;
  series: ModuleTrendPoint[];
}

/** 测评完成率 */
export interface AnalyticsAssessmentRate {
  source: AnalyticsSource;
  days: number;
  /** 开始测评人次 */
  started: number;
  /** 提交人次 */
  submitted: number;
  /** 完成率（0~1） */
  completeRate: number;
  /**
   * 测评提交数（分列指标，与 reportCount 区分口径）。
   * 后端数据源已改 assessment_record；比率口径为全量，days 不再影响比率（兼容保留）。
   */
  assessmentSubmitted?: number;
  /** 报告生成数（分列指标，与 assessmentSubmitted 区分口径） */
  reportCount?: number;
}

export function getOverview(): Promise<AnalyticsOverview> {
  return adminRequest<AnalyticsOverview>({ url: '/admin/analytics/overview', method: 'GET' });
}

export function getGrowth(days = 30): Promise<AnalyticsGrowth> {
  return adminRequest<AnalyticsGrowth>({ url: '/admin/analytics/growth', method: 'GET', params: { days } });
}

export function getFunnel(days = 30): Promise<AnalyticsFunnel> {
  return adminRequest<AnalyticsFunnel>({ url: '/admin/analytics/funnel', method: 'GET', params: { days } });
}

/** §5.4 功能模块使用占比。 */
export function getModuleUsage(days = 30): Promise<AnalyticsModuleUsage> {
  return adminRequest<AnalyticsModuleUsage>({ url: '/admin/analytics/module-usage', method: 'GET', params: { days } });
}

/** §5.5 功能模块使用趋势（moduleKey 缺省返回全部模块分组）。 */
export function getModuleTrend(days = 30, moduleKey?: string): Promise<AnalyticsModuleTrend> {
  return adminRequest<AnalyticsModuleTrend>({
    url: '/admin/analytics/module-trend',
    method: 'GET',
    params: moduleKey ? { days, moduleKey } : { days },
  });
}

export function getAssessmentRate(days = 30): Promise<AnalyticsAssessmentRate> {
  return adminRequest<AnalyticsAssessmentRate>({ url: '/admin/analytics/assessment-rate', method: 'GET', params: { days } });
}