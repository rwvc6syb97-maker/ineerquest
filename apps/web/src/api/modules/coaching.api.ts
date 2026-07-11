/**
 * 辅导咨询服务 API（P19-P26）
 * -------------------------------------------------------------
 * 对齐后端辅导模块（T4-01~T4-06）契约：
 *   GET  /coaches                       辅导师列表（分页 {list,total,page,pageSize}）
 *   GET  /coaches/:id                   辅导师详情
 *   GET  /coaches/:id/schedules         辅导师可约时段
 *   POST /coaching/orders               预约下单（返回订单，bizType=2 复用支付）
 *   POST /coaching/orders/:id/cancel    取消订单
 *   POST /coaching/orders/:id/review    提交评价（评分 1~5）
 *   GET  /coaching/orders               我的辅导订单列表
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

/**
 * 后端辅导师原始出参（字段命名与前端 CoachCard 不一致）。
 * 后端下发 realName / expertise / pricePerHour 等，需在此归一化为前端契约。
 * 全部字段可选，做防御性判空，避免因字段缺失导致 undefined.forEach 白屏崩溃。
 */
interface RawCoach {
  id?: string | number;
  coachId?: string | number;
  name?: string;
  realName?: string;
  nickname?: string;
  avatar?: string;
  avatarUrl?: string;
  title?: string;
  headline?: string;
  domains?: string[] | string;
  expertise?: string[] | string;
  tags?: string[] | string;
  price?: number;
  pricePerHour?: number;
  rating?: number;
  score?: number;
  reviewCount?: number;
  reviewNum?: number;
  orderCount?: number;
  orderNum?: number;
  closed?: boolean;
  status?: string;
  // 详情附加字段
  intro?: string;
  introduction?: string;
  bio?: string;
  experienceYears?: number;
  workYears?: number;
  durationMin?: number;
  duration?: number;
  reviews?: RawCoachReview[];
}

interface RawCoachReview {
  id?: string | number;
  userName?: string;
  userNickname?: string;
  rating?: number;
  score?: number;
  content?: string;
  comment?: string;
  createdAt?: string;
}

/** 将 domains/expertise 归一化为字符串数组（兼容字符串、逗号分隔、缺失） */
function toStringArray(v?: string[] | string): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
  if (typeof v === 'string' && v.trim()) return v.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

/** 后端 → 前端 CoachCard 归一化（BUG6：防止 c.domains.forEach 崩溃） */
function toCoachCard(raw: RawCoach): CoachCard {
  return {
    id: String(raw.id ?? raw.coachId ?? ''),
    name: raw.name ?? raw.realName ?? raw.nickname ?? '辅导师',
    avatar: raw.avatar ?? raw.avatarUrl,
    title: raw.title ?? raw.headline ?? '',
    domains: toStringArray(raw.domains ?? raw.expertise ?? raw.tags),
    price: Number(raw.price ?? raw.pricePerHour ?? 0),
    rating: Number(raw.rating ?? raw.score ?? 0),
    reviewCount: Number(raw.reviewCount ?? raw.reviewNum ?? 0),
    orderCount: raw.orderCount ?? raw.orderNum,
    closed: raw.closed ?? raw.status === 'closed',
  };
}

/** 后端 → 前端 CoachReview 归一化 */
function toCoachReview(raw: RawCoachReview): CoachReview {
  return {
    id: String(raw.id ?? ''),
    userName: raw.userName ?? raw.userNickname ?? '匿名用户',
    rating: Number(raw.rating ?? raw.score ?? 0),
    content: raw.content ?? raw.comment ?? '',
    createdAt: raw.createdAt ?? '',
  };
}

/** 后端 → 前端 CoachDetail 归一化 */
function toCoachDetail(raw: RawCoach): CoachDetail {
  return {
    ...toCoachCard(raw),
intro: raw.intro ?? raw.introduction ?? raw.bio ?? '',
    experienceYears: raw.experienceYears ?? raw.workYears,
    durationMin: raw.durationMin ?? raw.duration,
    reviews: Array.isArray(raw.reviews) ? raw.reviews.map(toCoachReview) : [],
  };
}

/** 后端辅导师列表分页出参（data 即该分页对象，request 已解包 data） */
interface RawCoachPage {
  list?: RawCoach[];
  total?: number;
  page?: number;
  pageSize?: number;
}

/**
 * 辅导师列表（BUG-2：后端返回分页对象 { list,total,page,pageSize }，
 * 而非裸数组。取 page.list 判空兜底为 [] 再 toCoachCard，防 undefined.map 崩溃）。
 */
export function listCoaches(params?: ListCoachesParams): Promise<CoachCard[]> {
  return request<RawCoachPage>({ url: '/coaches', method: 'GET', params }).then((page) =>
    Array.isArray(page?.list) ? page.list.map(toCoachCard) : [],
  );
}

/** 辅导师详情（后端出参经 toCoachDetail 归一化） */
export function getCoach(coachId: string): Promise<CoachDetail> {
  return request<RawCoach>({ url: `/coaches/${coachId}`, method: 'GET' }).then(toCoachDetail);
}

/** 辅导师可约时段（BUG-3：后端真实路由为复数 schedules） */
export function getSchedule(coachId: string): Promise<ScheduleSlot[]> {
  return request<ScheduleSlot[]>({ url: `/coaches/${coachId}/schedules`, method: 'GET' });
}

/** 预约下单（BUG-3：后端真实路由 POST /coaching/orders） */
export function bookCoaching(body: BookCoachingParams): Promise<BookCoachingResult> {
  return request<BookCoachingResult>({ url: '/coaching/orders', method: 'POST', data: body });
}

/** 提交评价（BUG-3：POST /coaching/orders/:id/review） */
export function reviewCoaching(orderId: string, body: ReviewCoachingParams): Promise<void> {
  return request<void>({ url: `/coaching/orders/${orderId}/review`, method: 'POST', data: body });
}

/** 取消订单（BUG-3：POST /coaching/orders/:id/cancel） */
export function cancelOrder(orderId: string): Promise<void> {
  return request<void>({ url: `/coaching/orders/${orderId}/cancel`, method: 'POST' });
}

/** 我的辅导订单列表（BUG-3：GET /coaching/orders） */
export function listOrders(): Promise<CoachingOrder[]> {
  return request<CoachingOrder[]>({ url: '/coaching/orders', method: 'GET' });
}