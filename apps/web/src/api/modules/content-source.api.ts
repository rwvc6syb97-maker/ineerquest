/**
 * 运营后台 - 内容可持续化 API（M1 / 后端 ops/content-source）
 * -------------------------------------------------------------
 * 严格对齐后端 content-source.controller.ts + content-source.dto.ts + service：
 *   /admin/content/source-tasks   AI 检索任务 CRUD + run（content:manage）
 *   /admin/content/careers/:id/review     职业审核流转
 *   /admin/content/resources/:id/review   资源审核流转
 *   /admin/content/careers|resources/import   CSV 导入（body.content 字符串，非 multipart）
 *   /admin/content/careers|resources/export   CSV 导出（UTF-8 BOM，blob 下载）
 *
 * 错误码（对齐 BizCode）：
 *   4600 任务不存在 / 4601 任务执行中(重复触发) / 4602 表头非法 / 4603 行级非法 / 4605 非法审核流转
 * 铁律：字段严格对齐后端；失败抛 ApiError 交页面错误态，禁止 mock 兜底；data 可选判空。
 */
import { adminRequest, adminHttp } from '../admin-client';
import type { ContentListResult } from './admin-content.api';

/** 内容可持续化错误码（前端兜底文案映射用，优先展示后端 message） */
export const CONTENT_SOURCE_CODE = {
  /** AI 检索任务不存在 */
  TASK_NOT_FOUND: 4600,
  /** 任务执行中，重复触发 */
  TASK_RUNNING: 4601,
  /** 导入 CSV 表头非法 */
  IMPORT_FORMAT_INVALID: 4602,
  /** 导入 CSV 行级非法 */
  IMPORT_ROW_INVALID: 4603,
  /** 非法审核流转 */
  REVIEW_STATUS_INVALID: 4605,
} as const;

// ==================== AI 检索任务 ====================

/**
 * AI 检索任务（对齐 Prisma ContentSourceTask serialize）。
 * targetType 1=岗位 2=资源；status 1=待执行 2=执行中 3=成功 4=失败。
 */
export interface SourceTaskItem {
  id: string;
  taskName: string;
  targetType: 1 | 2;
  /** 关键词数组（Prisma Json 列） */
  keywords: string[];
  schedule?: string | null;
  /** 1=待执行 2=执行中 3=成功 4=失败 */
  status: number;
  lastRunAt?: string | null;
  lastResultCount?: number | null;
  errorMsg?: string | null;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** 任务列表查询参数（对齐 listTasks query） */
export interface SourceTaskListParams {
  targetType?: 1 | 2;
  status?: number;
  page?: number;
  pageSize?: number;
}

/** 新建任务请求体（对齐 CreateSourceTaskDto，taskName/targetType/keywords 必填） */
export interface CreateSourceTaskParams {
  taskName: string;
  targetType: 1 | 2;
  /** 1~20 个，单个 ≤32 字 */
  keywords: string[];
  schedule?: string;
}

/** 更新任务请求体（对齐 UpdateSourceTaskDto，全部可选，PATCH） */
export interface UpdateSourceTaskParams {
  taskName?: string;
  targetType?: 1 | 2;
  keywords?: string[];
  schedule?: string;
}

/** 触发任务返回（对齐 runTask 出参） */
export interface RunTaskResult {
  taskId: string;
  /** 3=成功 4=失败 */
  status: number;
  inserted: number;
  skipped: number;
  errorMsg?: string;
}

export function listSourceTasks(
  params?: SourceTaskListParams,
): Promise<ContentListResult<SourceTaskItem>> {
  return adminRequest({ url: '/admin/content/source-tasks', method: 'GET', params });
}

export function sourceTaskDetail(id: string): Promise<SourceTaskItem> {
  return adminRequest<SourceTaskItem>({
    url: `/admin/content/source-tasks/${id}`,
    method: 'GET',
  });
}

export function createSourceTask(body: CreateSourceTaskParams): Promise<SourceTaskItem> {
  return adminRequest<SourceTaskItem>({
    url: '/admin/content/source-tasks',
    method: 'POST',
    data: body,
  });
}

export function updateSourceTask(
  id: string,
  body: UpdateSourceTaskParams,
): Promise<SourceTaskItem> {
  return adminRequest<SourceTaskItem>({
    url: `/admin/content/source-tasks/${id}`,
    method: 'PATCH',
    data: body,
  });
}

export function deleteSourceTask(id: string): Promise<{ taskId: string; deleted: boolean }> {
  return adminRequest({ url: `/admin/content/source-tasks/${id}`, method: 'DELETE' });
}

export function runSourceTask(id: string): Promise<RunTaskResult> {
  return adminRequest<RunTaskResult>({
    url: `/admin/content/source-tasks/${id}/run`,
    method: 'POST',
  });
}

// ==================== 内容审核流转 ====================

/** 审核请求体（对齐 ReviewContentDto：reviewStatus 2=上线 3=下线） */
export interface ReviewContentParams {
  reviewStatus: 2 | 3;
  remark?: string;
}

export function reviewCareer(
  id: string,
  body: ReviewContentParams,
): Promise<Record<string, unknown>> {
  return adminRequest({
    url: `/admin/content/careers/${id}/review`,
    method: 'POST',
    data: body,
  });
}

export function reviewResource(
  id: string,
  body: ReviewContentParams,
): Promise<Record<string, unknown>> {
  return adminRequest({
    url: `/admin/content/resources/${id}/review`,
    method: 'POST',
    data: body,
  });
}

// ==================== CSV 导入 / 导出 ====================

/** 导入结果（对齐 importCareers/importResources 出参） */
export interface ImportResult {
  total: number;
  inserted: number;
  failCount: number;
  failRows: Array<{ row: number; reason: string }>;
}

/** 导入职业 CSV：content 为整份 CSV 文本字符串（非 multipart） */
export function importCareers(content: string): Promise<ImportResult> {
  return adminRequest<ImportResult>({
    url: '/admin/content/careers/import',
    method: 'POST',
    data: { content },
  });
}

/** 导入学习资源 CSV：content 为整份 CSV 文本字符串（非 multipart） */
export function importResources(content: string): Promise<ImportResult> {
  return adminRequest<ImportResult>({
    url: '/admin/content/resources/import',
    method: 'POST',
    data: { content },
  });
}

/** 导出职业 CSV（UTF-8 BOM）→ Blob（后端为原始流，不走契约解包） */
export async function exportCareers(): Promise<Blob> {
  const resp = await adminHttp.request<Blob>({
    url: '/admin/content/careers/export',
    method: 'GET',
    responseType: 'blob',
  });
  return resp.data;
}

/** 导出学习资源 CSV（UTF-8 BOM）→ Blob */
export async function exportResources(): Promise<Blob> {
  const resp = await adminHttp.request<Blob>({
    url: '/admin/content/resources/export',
    method: 'GET',
    responseType: 'blob',
  });
  return resp.data;
}