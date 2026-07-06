/**
 * 辅导咨询服务 API（P19-P26）
 * -------------------------------------------------------------
 * 对齐后端辅导模块（T4-01~T4-06）契约：
 *   GET  /coaches                       辅导师列表（领域/价格/评分/时间筛选）
 *   GET  /coaches/:id                   辅导师详情
 *   GET  /coaches/:id/schedule          辅导师可约时段
 *   POST /coaches/book                  预约下单（返回订单，bizType=2 复用支付）
 *   POST /coaches/orders/:id/review     提交评价（评分 1~5）
 *   GET  /coaches/orders                我的辅导订单列表
 *
 * 说明：
 *  - 全部走 request（自动解包 {code,message,data,traceId}）。
 *  - 业务错误码：60001 时段已占用 / 60002 停止接单（在 hooks/页面处理）。
 *  - WS 实时会话见 useCoachingChat（namespace /ws/coaching）。
 */
import { request } from '../client';

/** 辅导师卡片（列表用） */
export interface CoachCard {
  id: string;
  name: string;
  avatar?: string;
  /** 一句话简介 / 头衔 */
  title: string;
  /** 擅长领域 */
  domains: string[];
  /** 单次咨询价格（单位：元） */
  price: number;
  /** 平均评分（0~5，一位小数） */
  rating: number;
  /** 累计评价数 */
  reviewCount: number;
  /** 累计咨询单数 */
  orderCount?: number;
  /** 是否停止接单（对齐 60002） */
  closed?: boolean;
}

/** 辅导师评价 */
export interface CoachReview {
  id: string;
  userName: string;
  rating: number;
  content: string;
  createdAt: string;
}

/** 辅导师详情 */
export interface CoachDetail extends CoachCard {
  /** 详细介绍（富文本已降级为纯文本段落） */
  intro: string;
  /** 从业年限 */
  experienceYears?: number;
  /** 服务时长（分钟） */
  durationMin?: number;
  /** 精选评价 */
  reviews: CoachReview[];
}

/** 可约时段 */
export interface ScheduleSlot {
  /** 时段唯一标识（预约时回传） */
  slotId: string;
  /** 开始时间 ISO */
  startAt: string;
  /** 结束时间 ISO */
  endAt: string;
  /** 是否可约（false=已占用，对齐 60001） */
  available: boolean;
}

/** 辅导订单状态（对齐后端 coaching.constants） */
export type CoachingOrderStatus =
  | 'pending'   // 待支付
  | 'paid'      // 已支付待咨询
  | 'ongoing'   // 咨询中
  | 'completed' // 已完成
  | 'canceled'  // 已取消
  | 'refunded'; // 已退款

/** 辅导订单 */
export interface CoachingOrder {
  id: string;
  coachId: string;
  coachName: string;
  coachAvatar?: string;
  /** 关联会话（支付后生成，用于进入 P22） */
  sessionId?: string;
  status: CoachingOrderStatus;
  price: number;
  /** 预约时段 */
  startAt: string;
  endAt: string;
  /** 用户诉求 */
  demand?: string;
  /** 是否已评价 */
  reviewed: boolean;
  createdAt: string;
}

/** 列表查询参数 */
export interface ListCoachesParams {
  /** 领域筛选 */
  domain?: string;
  /** 最低评分 */
  minRating?: number;
  /** 价格上限 */
  maxPrice?: number;
  /** 关键词 */
  keyword?: string;
}

/** 预约请求体（对齐 BookCoachingDto） */
export interface BookCoachingParams {
  coachId: string;
  slotId: string;
  /** 用户诉求描述 */
  demand?: string;
}

/** 预约返回（含订单 id，进入支付收银台） */
export interface BookCoachingResult {
  orderId: string;
  /** 支付业务类型固定为 2（咨询订单） */
  bizType: number;
  amount: number;
}

/** 评价请求体（对齐 ReviewCoachingDto） */
export interface ReviewCoachingParams {
  /** 1~5 */
  rating: number;
  content?: string;
}

/** 辅导师列表 */
export function listCoaches(params?: ListCoachesParams): Promise<CoachCard[]> {
  return request<CoachCard[]>({ url: '/coaches', method: 'GET', params });
}

/** 辅导师详情 */
export function getCoach(coachId: string): Promise<CoachDetail> {
  return request<CoachDetail>({ url: `/coaches/${coachId}`, method: 'GET' });
}

/** 辅导师可约时段 */
export function getSchedule(coachId: string): Promise<ScheduleSlot[]> {
  return request<ScheduleSlot[]>({ url: `/coaches/${coachId}/schedule`, method: 'GET' });
}

/** 预约下单 */
export function bookCoaching(body: BookCoachingParams): Promise<BookCoachingResult> {
  return request<BookCoachingResult>({ url: '/coaches/book', method: 'POST', data: body });
}

/** 提交评价 */
export function reviewCoaching(orderId: string, body: ReviewCoachingParams): Promise<void> {
  return request<void>({ url: `/coaches/orders/${orderId}/review`, method: 'POST', data: body });
}

/** 我的辅导订单列表 */
export function listOrders(): Promise<CoachingOrder[]> {
  return request<CoachingOrder[]>({ url: '/coaches/orders', method: 'GET' });
}