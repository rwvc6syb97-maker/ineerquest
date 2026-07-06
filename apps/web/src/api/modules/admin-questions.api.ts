/**
 * 运营后台 - 题库管理 API（T4-18 / P33）
 * -------------------------------------------------------------
 * 对齐后端 ops/questions controller：
 *   GET    /admin/questions              列表（question:read；version/status/dimension/page/pageSize）
 *   POST   /admin/questions              新增（question:write）
 *   PUT    /admin/questions/:id          编辑（question:write）
 *   DELETE /admin/questions/:id          删除（question:write）
 *   POST   /admin/questions/import       批量导入（question:write）
 *   PATCH  /admin/questions/batch-status 批量改状态（question:write，BatchStatusDto）
 */
import { adminRequest } from '../admin-client';

/** MBTI 维度（对齐后端枚举） */
export type QuestionDimension = 'EI' | 'SN' | 'TF' | 'JP';

/** 题目状态：1 启用 / 0 停用 / 2 草稿 */
export type QuestionStatus = 0 | 1 | 2;

/** 选项 */
export interface QuestionOption {
  id?: string;
  /** 选项文案 */
  content: string;
  /** 计分方向权重（对齐后端 score 字段） */
  score: number;
}

/** 题目 */
export interface AdminQuestion {
  id: string;
  /** 题干 */
  content: string;
  dimension: QuestionDimension;
  version: string;
  status: QuestionStatus;
  options: QuestionOption[];
  sort?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** 列表查询参数 */
export interface ListQuestionsParams {
  version?: string;
  status?: QuestionStatus;
  dimension?: QuestionDimension;
  page?: number;
  pageSize?: number;
}

/** 列表返回（分页） */
export interface QuestionListResult {
  total: number;
  page: number;
  pageSize: number;
  list: AdminQuestion[];
}

/** 新增 / 编辑请求体 */
export interface UpsertQuestionParams {
  content: string;
  dimension: QuestionDimension;
  version: string;
  status: QuestionStatus;
  options: QuestionOption[];
  sort?: number;
}

/** 批量改状态请求体（对齐 BatchStatusDto，字段均必填） */
export interface BatchStatusParams {
  ids: string[];
  status: QuestionStatus;
  reason: string;
}

/** 批量导入返回 */
export interface ImportResult {
  imported: number;
  failed: number;
  errors?: string[];
}

export function listQuestions(params?: ListQuestionsParams): Promise<QuestionListResult> {
  return adminRequest<QuestionListResult>({ url: '/admin/questions', method: 'GET', params });
}

export function createQuestion(body: UpsertQuestionParams): Promise<AdminQuestion> {
  return adminRequest<AdminQuestion>({ url: '/admin/questions', method: 'POST', data: body });
}

export function updateQuestion(id: string, body: UpsertQuestionParams): Promise<AdminQuestion> {
  return adminRequest<AdminQuestion>({ url: `/admin/questions/${id}`, method: 'PUT', data: body });
}

export function deleteQuestion(id: string): Promise<void> {
  return adminRequest<void>({ url: `/admin/questions/${id}`, method: 'DELETE' });
}

export function importQuestions(items: UpsertQuestionParams[]): Promise<ImportResult> {
  return adminRequest<ImportResult>({
    url: '/admin/questions/import',
    method: 'POST',
    data: { items },
  });
}

export function batchStatus(body: BatchStatusParams): Promise<void> {
  return adminRequest<void>({
    url: '/admin/questions/batch-status',
    method: 'PATCH',
    data: body,
  });
}