/**
 * 运营后台 - 内容管理 API（T4-18 / P34）
 * -------------------------------------------------------------
 * 对齐后端 ops/content controller：
 *   /admin/content/careers   CRUD（career:read / career:write）
 *   /admin/content/resources CRUD（resource:read / resource:write）
 *   /admin/content/topics    ⚠️ 返回 501 NotImplemented（无 Topic model，blocked）
 *
 * 删除操作需 confirm=true。topics 相关方法调用后会抛 ApiError(code=501)，
 * 页面据此展示「功能暂未开放」占位，禁止白屏。
 */
import { adminRequest } from '../admin-client';

/** 上下线状态：1 上线 / 0 下线 */
export type ContentStatus = 0 | 1;

/** 职业词条 */
export interface CareerItem {
  id: string;
  /** 职业名称 */
  name: string;
  /** 所属类别 */
  category: string;
  /** 简介 */
  summary: string;
  /** 详情正文（纯文本/富文本 HTML） */
  content?: string;
  /** 关联 MBTI 类型标签 */
  mbtiTags?: string[];
  status: ContentStatus;
  updatedAt?: string;
}

/** 学习资源 */
export interface ResourceItem {
  id: string;
  title: string;
  /** 资源类型：文章 / 视频 / 书籍 等 */
  type: string;
  /** 外链或正文 */
  url?: string;
  cover?: string;
  summary?: string;
  status: ContentStatus;
  updatedAt?: string;
}

/** 通用列表查询参数 */
export interface ContentListParams {
  keyword?: string;
  status?: ContentStatus;
  page?: number;
  pageSize?: number;
}

/** 分页列表返回 */
export interface ContentListResult<T> {
  total: number;
  page: number;
  pageSize: number;
  list: T[];
}

/** 职业词条新增/编辑请求体 */
export interface UpsertCareerParams {
  name: string;
  category: string;
  summary: string;
  content?: string;
  mbtiTags?: string[];
  status: ContentStatus;
}

/** 资源新增/编辑请求体 */
export interface UpsertResourceParams {
  title: string;
  type: string;
  url?: string;
  cover?: string;
  summary?: string;
  status: ContentStatus;
}

// ---- 职业词条 ----
export function listCareers(params?: ContentListParams): Promise<ContentListResult<CareerItem>> {
  return adminRequest({ url: '/admin/content/careers', method: 'GET', params });
}

export function createCareer(body: UpsertCareerParams): Promise<CareerItem> {
  return adminRequest<CareerItem>({ url: '/admin/content/careers', method: 'POST', data: body });
}

export function updateCareer(id: string, body: UpsertCareerParams): Promise<CareerItem> {
  return adminRequest<CareerItem>({ url: `/admin/content/careers/${id}`, method: 'PUT', data: body });
}

export function deleteCareer(id: string): Promise<void> {
  return adminRequest<void>({
    url: `/admin/content/careers/${id}`,
    method: 'DELETE',
    data: { confirm: true },
  });
}

// ---- 学习资源 ----
export function listResources(params?: ContentListParams): Promise<ContentListResult<ResourceItem>> {
  return adminRequest({ url: '/admin/content/resources', method: 'GET', params });
}

export function createResource(body: UpsertResourceParams): Promise<ResourceItem> {
  return adminRequest<ResourceItem>({ url: '/admin/content/resources', method: 'POST', data: body });
}

export function updateResource(id: string, body: UpsertResourceParams): Promise<ResourceItem> {
  return adminRequest<ResourceItem>({ url: `/admin/content/resources/${id}`, method: 'PUT', data: body });
}

export function deleteResource(id: string): Promise<void> {
  return adminRequest<void>({
    url: `/admin/content/resources/${id}`,
    method: 'DELETE',
    data: { confirm: true },
  });
}

// ---- 话题管理（blocked：后端返回 501，页面需优雅占位）----
/** 话题（占位类型，后端 Topic model 未落地） */
export interface TopicItem {
  id: string;
  title: string;
  status: ContentStatus;
}

/** ⚠️ 调用即抛 ApiError(code=501)，页面据此展示占位。 */
export function listTopics(params?: ContentListParams): Promise<ContentListResult<TopicItem>> {
  return adminRequest({ url: '/admin/content/topics', method: 'GET', params });
}