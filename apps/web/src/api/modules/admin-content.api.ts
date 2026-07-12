/**
 * 运营后台 - 内容管理 API（T4-18 / P34）
 * -------------------------------------------------------------
 * 对齐后端 ops/content controller：
 *   /admin/content/careers   CRUD（career:read / career:write）
 *   /admin/content/resources CRUD（resource:read / resource:write）
 *   /admin/content/topics    CRUD + 审核（topic:review）
 *
 * 删除操作需 confirm=true。接口失败统一抛 ApiError 交页面错误态，禁止 mock 兜底。
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

// ---- 话题管理（topic:review）----

/** 审核状态：0 待审核 / 1 已通过 / 2 已驳回（对齐后端 Topic.auditStatus） */
export type TopicAuditStatus = 0 | 1 | 2;

/**
 * 话题（对齐后端 Prisma Topic model + serialize，bigint 序列化为 string）。
 * 出参字段以后端 admin-content.service.ts serialize 透传为准。
 */
export interface TopicItem {
  id: string;
  title: string;
  content: string;
  category: string | null;
  tags: string | null;
  authorId: string;
  viewCount: number;
  likeCount: number;
  replyCount: number;
  /** 0 不置顶 / 1 置顶 */
  isPinned: number;
  auditStatus: TopicAuditStatus;
  status: ContentStatus;
  createdAt?: string;
  updatedAt?: string;
}

/** 话题列表查询参数（对齐后端 listTopics query） */
export interface TopicListParams {
  auditStatus?: TopicAuditStatus;
  status?: ContentStatus;
  category?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 话题新增请求体（对齐 CreateTopicDto） */
export interface CreateTopicParams {
  title: string;
  content: string;
  category?: string;
  tags?: string;
  /** 0 / 1 */
  isPinned?: number;
}

/** 话题编辑请求体（对齐 UpdateTopicDto） */
export interface UpdateTopicParams {
  title?: string;
  content?: string;
  category?: string;
  tags?: string;
  isPinned?: number;
  status?: ContentStatus;
}

/** 话题审核请求体（对齐 ReviewTopicDto：auditStatus 1 通过 / 2 驳回） */
export interface ReviewTopicParams {
  auditStatus: 1 | 2;
  auditRemark?: string;
}

export function listTopics(params?: TopicListParams): Promise<ContentListResult<TopicItem>> {
  return adminRequest({ url: '/admin/content/topics', method: 'GET', params });
}

export function topicDetail(id: string): Promise<TopicItem> {
  return adminRequest<TopicItem>({ url: `/admin/content/topics/${id}`, method: 'GET' });
}

export function createTopic(body: CreateTopicParams): Promise<TopicItem> {
  return adminRequest<TopicItem>({ url: '/admin/content/topics', method: 'POST', data: body });
}

export function updateTopic(id: string, body: UpdateTopicParams): Promise<TopicItem> {
  return adminRequest<TopicItem>({ url: `/admin/content/topics/${id}`, method: 'PUT', data: body });
}

export function deleteTopic(id: string, reason?: string): Promise<{ id: string; removed: boolean; reason: string | null }> {
  return adminRequest({
    url: `/admin/content/topics/${id}`,
    method: 'DELETE',
    data: { confirm: true, reason },
  });
}

export function reviewTopic(id: string, body: ReviewTopicParams): Promise<TopicItem> {
  return adminRequest<TopicItem>({
    url: `/admin/content/topics/${id}/review`,
    method: 'POST',
    data: body,
  });
}