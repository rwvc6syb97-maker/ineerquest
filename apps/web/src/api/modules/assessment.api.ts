/**
 * 测评服务 API
 * 对齐契约：
 *  GET  /assessments/questions            按维度/版本取题
 *  POST /assessments/records              创建测评记录（草稿）
 *  PATCH /assessments/records/:id/answers 保存草稿续答
 *  POST /assessments/records/:id/submit   提交计分（返回 4 字母 MBTI 类型）
 *  GET  /assessments/records              测评历史列表
 *  GET  /assessments/records/:id/result   结果详情
 */
import { request } from '../client';
import type { Paginated } from '@innerquest/shared';

/** MBTI 维度 */
export type Dimension = 'EI' | 'SN' | 'TF' | 'JP';

/** 题目 */
export interface Question {
  id: string;
  dimension: Dimension;
  /** 题干 */
  content: string;
  /** 选项 */
  options: { id: string; value: number; label: string }[];
}

/** 单题作答 */
export interface Answer {
  questionId: string;
  optionId: string;
}

/** 测评记录 */
export interface AssessmentRecord {
  id: string;
  status: 'draft' | 'submitted';
  version: string;
  mbtiType?: string | null;
  answers?: Answer[];
  createdAt: string;
  updatedAt: string;
}

/** 计分结果 */
export interface AssessmentResult {
  recordId: string;
  mbtiType: string;
  /** 四维度倾向百分比（0-100，越大越偏后者） */
  dimensions: Record<Dimension, { left: string; right: string; score: number }>;
  createdAt: string;
}

/** 取题（可按版本） */
export function getQuestions(version = 'v1'): Promise<Question[]> {
  return request<Question[]>({
    url: '/assessments/questions',
    method: 'GET',
    params: { version },
  });
}

/** 创建测评记录（进入答题时调用） */
export function createRecord(version = 'v1'): Promise<AssessmentRecord> {
  return request<AssessmentRecord>({
    url: '/assessments/records',
    method: 'POST',
    data: { version },
  });
}

/** 保存草稿续答 */
export function saveAnswers(recordId: string, answers: Answer[]): Promise<AssessmentRecord> {
  return request<AssessmentRecord>({
    url: `/assessments/records/${recordId}/answers`,
    method: 'PATCH',
    data: { answers },
  });
}

/** 提交计分（答卷不完整返回 30002） */
export function submitRecord(recordId: string): Promise<AssessmentResult> {
  return request<AssessmentResult>({
    url: `/assessments/records/${recordId}/submit`,
    method: 'POST',
  });
}

/** 测评历史列表 */
export function listRecords(page = 1, pageSize = 10): Promise<Paginated<AssessmentRecord>> {
  return request<Paginated<AssessmentRecord>>({
    url: '/assessments/records',
    method: 'GET',
    params: { page, pageSize },
  });
}

/** 结果详情 */
export function getResult(recordId: string): Promise<AssessmentResult> {
  return request<AssessmentResult>({
    url: `/assessments/records/${recordId}/result`,
    method: 'GET',
  });
}