/**
 * 站点统计 API
 * 对齐契约（权威，字段不得私改）：
 *  GET /stats/home  公开无需 token，后端已做 5 分钟缓存；无数据时后端全兜底 0，不报错。
 */
import { request } from '../client';

/** 首页公开统计（GET /stats/home 返回 data，字段类型与后端严格一致） */
export interface HomeStats {
  /** 已完成测评份数 */
  completedCount: number;
  /** 用户满意度：0~100 整数 */
  satisfactionRate: number;
  /** 职业方向库数量 */
  careerCount: number;
  /** 报告平均评分：1 位小数 */
  avgReportRating: number;
}

/** 获取首页公开统计（公开接口，无需登录） */
export function getHomeStats(): Promise<HomeStats> {
  return request<HomeStats>({ url: '/stats/home', method: 'GET' });
}