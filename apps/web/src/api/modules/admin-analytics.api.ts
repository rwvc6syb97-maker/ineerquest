/**
 * 运营后台 - 数据看板 API（T4-17 / P35）
 * -------------------------------------------------------------
 * 对齐后端 ops/analytics controller（权限 analytics:read，controller 级）：
 *   GET /admin/analytics/overview                 核心指标概览
 *   GET /admin/analytics/growth?days=             用户增长曲线
 *   GET /admin/analytics/funnel?days=             测评转化漏斗
 *   GET /admin/analytics/revenue?days=            营收趋势
 *   GET /admin/analytics/assessment-rate?days=    测评完成率
 *
 * 数据源降级：后端返回 source 字段（clickhouse|mysql|mock），页面据此标注。
 * 全部走 adminRequest（注入 admin token，自动解包契约）。
 */
import { adminRequest } from '../admin-client';

/** 数据来源（用于前端标注降级状态） */
export type AnalyticsSource = 'clickhouse' | 'mysql' | 'mock';

/** 核心指标概览 */
export interface AnalyticsOverview {
  source: AnalyticsSource;
  /** 累计用户数 */
  totalUsers: number;
  /** 付费用户数 */
  paidUsers: number;
  /** 付费率（0~1） */
  payRate: number;
  /** 付费订单数 */
  paidOrders: number;
  /** 累计 GMV（单位：分） */
  gmvCents: number;
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

/** 漏斗步骤（对齐后端埋点事件） */
export type FunnelStep =
  | 'assessment_start'
  | 'submit'
  | 'report_generate'
  | 'report_unlock';

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

/** 单日营收点 */
export interface RevenuePoint {
  date: string;
  /** 当日营收（单位：分） */
  amountCents: number;
  /** 当日订单数 */
  orders: number;
}

/** 营收趋势 */
export interface AnalyticsRevenue {
  source: AnalyticsSource;
  days: number;
  series: RevenuePoint[];
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

export function getRevenue(days = 30): Promise<AnalyticsRevenue> {
  return adminRequest<AnalyticsRevenue>({ url: '/admin/analytics/revenue', method: 'GET', params: { days } });
}

export function getAssessmentRate(days = 30): Promise<AnalyticsAssessmentRate> {
  return adminRequest<AnalyticsAssessmentRate>({ url: '/admin/analytics/assessment-rate', method: 'GET', params: { days } });
}