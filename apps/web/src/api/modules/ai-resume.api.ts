/**
 * M4 简历上传优化 API（§6）
 * -------------------------------------------------------------
 * 对齐后端 ai-resume.controller.ts：
 *   POST /ai/resume/optimize          multipart：file(PDF≤10MB) + targetCareerId + note?
 *   GET  /ai/resume/optimize          历史优化记录列表
 *   GET  /ai/resume/optimize/:docId  优化记录详情（含 suggestions）
 *
 * 出参字段严格对齐 ai-resume.dto.ts 冻结结构（§6.3）。
 * 所有 data 字段做可选判空，禁止接口失败静默回退 mock。
 */
import { request } from '../client';

/** §6.3 冻结：单条优化建议 */
export interface ResumeSuggestionItem {
  /** 简历段落名 */
  section: string;
  /** 原文片段 */
  original: string;
  /** 优化后建议 */
  suggestion: string;
  /** 优化理由 */
  reason: string;
}

/** §6.3 冻结：目标职业信息 */
export interface ResumeTargetCareer {
  careerId: string;
  name: string;
  category: string;
}

/** §6.3 冻结：suggestions 结构化结果 */
export interface ResumeSuggestions {
  /** 匹配度 0~100 */
  matchScore: number;
  /** 整体评价 */
  overallComment: string;
  /** 逐段优化建议 */
  items: ResumeSuggestionItem[];
  /** 缺失关键词 */
  missingKeywords: string[];
  /** 目标职业 */
  targetCareer: ResumeTargetCareer;
}

/** §6 简历上传优化出参（POST /ai/resume/optimize、GET /ai/resume/optimize/:docId） */
export interface ResumeOptimizeResult {
  /** 文档 id（ai_resume_doc.id） */
  docId: string;
  /** 上传原文件名（后端不存二进制） */
  sourceFileName: string;
  /** 优化建议 */
  suggestions: ResumeSuggestions;
  /** 是否走了降级兜底 */
  degraded: boolean;
  /** 过期时间（ISO8601，默认 30 天） */
  expireAt: string;
}

/** §6 历史优化文档列表项（注意：列表项无 targetCareer 对象，仅 targetCareerId） */
export interface ResumeOptimizeListItem {
  docId: string;
  sourceFileName: string;
  targetCareerId: string;
  matchScore: number;
  degraded: boolean;
  createdAt: string;
  expireAt: string;
}

/** 上传优化入参（前端组装 FormData 用） */
export interface ResumeOptimizePayload {
  /** PDF 文件（≤10MB） */
  file: File;
  /** 目标岗位 id（必填，≤32） */
  targetCareerId: string;
  /** 补充说明（可选，≤500） */
  note?: string;
}

/**
 * 简历优化业务错误码（对齐后端契约，仅用于页面提示分流；文案优先用后端 message）。
 * 4620 无文件 / 4621 非PDF / 4622 超10MB / 4623 提取失败(加密/扫描件/空)
 * 4624 岗位缺失或不存在 / 4625 简历文本超20000字 / 4516 敏感词
 * 4090 同哈希重复提交 / 4501 配额超限 / 4001 未登录 / 4003 越权 / 4004 记录不存在
 */
export const RESUME_OPTIMIZE_CODE = {
  NO_FILE: 4620,
  NOT_PDF: 4621,
  TOO_LARGE: 4622,
  EXTRACT_FAILED: 4623,
  CAREER_MISSING: 4624,
  TEXT_TOO_LONG: 4625,
  SENSITIVE: 4516,
  DUPLICATE: 4090,
  QUOTA_EXCEEDED: 4501,
  UNAUTHORIZED: 4001,
  FORBIDDEN: 4003,
  NOT_FOUND: 4004,
} as const;

/**
 * 上传 PDF + 目标岗位，获取结构化优化建议。
 * multipart/form-data：删除默认 JSON Content-Type，交由浏览器自动带 boundary。
 * LLM 失败/超时时后端 degraded=true 返回兜底建议（仍 code=200）。
 */
export function optimizeResume(payload: ResumeOptimizePayload): Promise<ResumeOptimizeResult> {
  const form = new FormData();
  form.append('file', payload.file);
  form.append('targetCareerId', payload.targetCareerId);
  if (payload.note) form.append('note', payload.note);
  return request<ResumeOptimizeResult>({
    url: '/ai/resume/optimize',
    method: 'POST',
    data: form,
    // 覆盖实例默认 application/json，置空让 axios 依据 FormData 自动设置 multipart boundary
    headers: { 'Content-Type': undefined },
    // 文本抽取 + LLM 生成耗时较长，单独放宽超时
    timeout: 60000,
  });
}

/** 历史优化记录列表（当前用户，倒序，最多 100 条） */
export function listResumeOptimizeDocs(): Promise<ResumeOptimizeListItem[]> {
  return request<ResumeOptimizeListItem[]>({
    url: '/ai/resume/optimize',
    method: 'GET',
  });
}

/** 优化记录详情（含 suggestions）。越权 4003 / 不存在 4004 */
export function getResumeOptimizeDoc(docId: string): Promise<ResumeOptimizeResult> {
  return request<ResumeOptimizeResult>({
    url: `/ai/resume/optimize/${docId}`,
    method: 'GET',
  });
}