/**
 * 运营后台 - 内容管理 API（M1 内容可持续化 / 后端 ops/admin-content）
 * -------------------------------------------------------------
 * 严格对齐后端 admin-content.controller.ts + admin-content.dto.ts + service.serialize：
 *   /admin/content/careers   CRUD（career:read / career:write）
 *   /admin/content/resources CRUD（resource:read / resource:write）
 *   /admin/content/topics    CRUD + 审核（topic:review）
 *
 * 铁律：
 *  - 字段名/类型/枚举严格与后端 DTO 一致，不私自新增或改名。
 *  - serialize 将 bigint 序列化为 string，故所有 id 为 string。
 *  - 删除为敏感操作，必须携带 confirm=true。
 *  - 接口失败统一抛 ApiError 交页面错误态，禁止 mock 兜底。
 *  - data 字段一律做可选判空，防后端字段缺失白屏。
 */
import { adminRequest } from '../admin-client';

/** 上下线状态：1 上线 / 0 下线（对齐 DTO status @IsIn([0,1])） */
export type ContentStatus = 0 | 1;

/** 分页列表返回（对齐 service：{total,page,pageSize,list}） */
export interface ContentListResult<T> {
  total: number;
  page: number;
  pageSize: number;
  list: T[];
}

// ==================== 职业库 ====================

/**
 * 职业词条（对齐 Prisma Career serialize 透传字段）。
 * salaryMin/salaryMax 可空；status 0/1；reviewStatus 由审核流转维护。
 */
export interface CareerItem {
  id: string;
  careerCode: string;
  name: string;
  category: string;
  description?: string | null;
  responsibility?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  prospect?: string | null;
  /** 逗号分隔的适配 MBTI 类型 */
  suitTypes?: string | null;
  status: ContentStatus;
  /** 审核态：1 草稿 / 2 上线 / 3 下线（审核流转维护，可空兼容旧数据） */
  reviewStatus?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

/** 职业详情（含关联技能） */
export interface CareerDetail extends CareerItem {
  skills?: Array<Record<string, unknown>>;
}

/** 职业列表查询参数（对齐 listCareers query） */
export interface CareerListParams {
  category?: string;
  status?: ContentStatus;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 新建职业请求体（对齐 CreateCareerDto，*必填） */
export interface CreateCareerParams {
  careerCode: string;
  name: string;
  category: string;
  description?: string;
  responsibility?: string;
  salaryMin?: number;
  salaryMax?: number;
  prospect?: string;
  suitTypes?: string;
  status?: ContentStatus;
}

/** 更新职业请求体（对齐 UpdateCareerDto，全部可选，careerCode 不可改） */
export interface UpdateCareerParams {
  name?: string;
  category?: string;
  description?: string;
  responsibility?: string;
  salaryMin?: number;
  salaryMax?: number;
  prospect?: string;
  suitTypes?: string;
  status?: ContentStatus;
}

export function listCareers(params?: CareerListParams): Promise<ContentListResult<CareerItem>> {
  return adminRequest({ url: '/admin/content/careers', method: 'GET', params });
}

export function careerDetail(id: string): Promise<CareerDetail> {
  return adminRequest<CareerDetail>({ url: `/admin/content/careers/${id}`, method: 'GET' });
}

export function createCareer(body: CreateCareerParams): Promise<CareerItem & { indexed?: boolean }> {
  return adminRequest({ url: '/admin/content/careers', method: 'POST', data: body });
}

export function updateCareer(
  id: string,
  body: UpdateCareerParams,
): Promise<CareerItem & { indexed?: boolean }> {
  return adminRequest({ url: `/admin/content/careers/${id}`, method: 'PUT', data: body });
}

export function deleteCareer(
  id: string,
  reason?: string,
): Promise<{ id: string; removed: boolean; indexed?: boolean; reason: string | null }> {
  return adminRequest({
    url: `/admin/content/careers/${id}`,
    method: 'DELETE',
    data: { confirm: true, reason },
  });
}

// ==================== 学习资源库 ====================

/**
 * 学习资源（对齐 Prisma LearningResource serialize 透传）。
 * resourceType 为 number（后端枚举，非字符串）。
 */
export interface ResourceItem {
  id: string;
  title: string;
  /** 资源类型枚举（number，具体值以后端字典为准） */
  resourceType: number;
  url?: string | null;
  /** 逗号分隔技能标签 */
  skillTags?: string | null;
  careerId?: string | null;
  provider?: string | null;
  status: ContentStatus;
  reviewStatus?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

/** 资源列表查询参数（对齐 listResources query） */
export interface ResourceListParams {
  resourceType?: number;
  status?: ContentStatus;
  careerId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 新建资源请求体（对齐 CreateResourceDto，title/resourceType 必填） */
export interface CreateResourceParams {
  title: string;
  resourceType: number;
  url?: string;
  skillTags?: string;
  careerId?: string;
  provider?: string;
  status?: ContentStatus;
}

/** 更新资源请求体（对齐 UpdateResourceDto，全部可选） */
export interface UpdateResourceParams {
  title?: string;
  resourceType?: number;
  url?: string;
  skillTags?: string;
  careerId?: string;
  provider?: string;
  status?: ContentStatus;
}

export function listResources(
  params?: ResourceListParams,
): Promise<ContentListResult<ResourceItem>> {
  return adminRequest({ url: '/admin/content/resources', method: 'GET', params });
}

export function createResource(
  body: CreateResourceParams,
): Promise<ResourceItem & { indexed?: boolean }> {
  return adminRequest({ url: '/admin/content/resources', method: 'POST', data: body });
}

export function updateResource(
  id: string,
  body: UpdateResourceParams,
): Promise<ResourceItem & { indexed?: boolean }> {
  return adminRequest({ url: `/admin/content/resources/${id}`, method: 'PUT', data: body });
}

export function deleteResource(
  id: string,
  reason?: string,
): Promise<{ id: string; removed: boolean; indexed?: boolean; reason: string | null }> {
  return adminRequest({
    url: `/admin/content/resources/${id}`,
    method: 'DELETE',
    data: { confirm: true, reason },
  });
}

// ==================== 话题管理（topic:review） ====================

/** 审核状态：0 待审核 / 1 已通过 / 2 已驳回（对齐后端 Topic.auditStatus） */
export type TopicAuditStatus = 0 | 1 | 2;

/** 话题（对齐 Prisma Topic model + serialize） */
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

export function deleteTopic(
  id: string,
  reason?: string,
): Promise<{ id: string; removed: boolean; reason: string | null }> {
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