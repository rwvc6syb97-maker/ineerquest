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

/** MBTI 维度 */
export type Dimension = 'EI' | 'SN' | 'TF' | 'JP';

/** 题目选项（后端权威出参 v2.2） */
export interface QuestionOption {
  id: string;
  optionKey: string;
  content: string;
  polarity: number;
  score: number;
  sortOrder: number;
}

/** 题目（后端权威出参 v2.2） */
export interface Question {
  id: string;
  /** 维度：字符串枚举，非 number */
  dimension: Dimension;
  /** 题干 */
  content: string;
  sortOrder: number;
  isReverse: number;
  /** 选项 */
  options: QuestionOption[];
}

/** 题库（GET /assessments/questions 返回 data，v2.2 权威出参） */
export interface QuestionBank {
  version: string;
  total: number;
  questions: Question[];
}

/** 单题作答（上送后端，与 AnswerItemDto 对齐：number 类型） */
export interface Answer {
  questionId: number;
  optionId: number;
}

/** 测评记录（草稿/续答场景，POST records / PATCH answers 返回） */
export interface AssessmentRecord {
  id: string;
  status: 'draft' | 'submitted';
  version: string;
  mbtiType?: string | null;
  answers?: Answer[];
  createdAt: string;
  updatedAt: string;
}

/** 测评历史列表项（GET /assessments/records 返回，后端权威出参） */
export interface AssessmentHistoryItem {
  id: string;
  recordNo: string;
  questionVersion: string;
  totalQuestions: number;
  status: 'draft' | 'submitted';
  mbtiType?: string | null;
  /** B3：报告 id（number | null），供历史页跳转报告详情 */
  reportId: number | null;
  startedAt: string | null;
  submittedAt: string | null;
}

/** 计分结果（POST submit / GET result 返回 data，v2.2 权威出参） */
export interface AssessmentResult {
  resultId: string;
  recordNo: string;
  recordId: string;
  /** B3：提交自动建报告后返回的报告 id（number | null），供跳转报告详情 */
  reportId: number | null;
  /** 4 字母 MBTI 类型，如 'ENFJ' */
  mbtiType: string;
  /** 四维度倾向，固定 4 项（EI/SN/TF/JP），数组形式 */
  dimensions: { dimension: Dimension; left: string; right: string; score: number }[];
  summary: string;
  typeGroup: number;
  isAbnormal: boolean;
  /** ISO8601 UTC（带 Z），展示需本地化转东八区 */
  completedAt: string | null;
}

/** 取题（可按版本） */
export function getQuestions(version = 'v2'): Promise<QuestionBank> {
  return request<QuestionBank>({
    url: '/assessments/questions',
    method: 'GET',
    params: { version },
  });
}

/** 创建测评记录（进入答题时调用） */
export function createRecord(version = 'v2'): Promise<AssessmentRecord> {
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

/** 提交计分（答卷不完整返回 4202 ASSESSMENT_INCOMPLETE） */
export function submitRecord(recordId: string): Promise<AssessmentResult> {
  return request<AssessmentResult>({
    url: `/assessments/records/${recordId}/submit`,
    method: 'POST',
  });
}

/** 测评历史列表（后端返回纯数组，非分页） */
export function listRecords(): Promise<AssessmentHistoryItem[]> {
  return request<AssessmentHistoryItem[]>({
    url: '/assessments/records',
    method: 'GET',
  });
}

/** 结果详情 */
export function getResult(recordId: string): Promise<AssessmentResult> {
  return request<AssessmentResult>({
    url: `/assessments/records/${recordId}/result`,
    method: 'GET',
  });
}