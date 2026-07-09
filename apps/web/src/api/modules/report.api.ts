/**
 * 报告服务 API（§6.1 完整 8 端点）
 * 对齐契约：
 *  POST /reports             生成免费预览段（日限 3 份，超限 4302）
 *  GET  /reports/:id        获取报告（未解锁付费段返回 4302）
 *  GET  /reports/:id/sections          章节列表（§6.1 #2）
 *  GET  /reports/:id/sections/:key    章节详情（§6.1 #3）
 *  POST /reports/:id/generate         触发 LLM 深度生成（§6.1 #4）
 *  POST /reports/:id/share            生成分享/海报
 *  POST /reports/:id/unlock           支付后解锁
 *  GET  /reports/:id/export          导出 PDF
 */
import { request } from '../client';
import type { Paginated } from '@innerquest/shared';

/** 报告章节（列表项） */
export interface ReportSectionItem {
  sectionKey: string;
  title: string;
  isFree: boolean;
  paid: boolean;
  sortOrder: number;
  /** 未解锁时付费章节 content 为 null */
  content: string | null;
}

/** 报告章节详情（含完整内容） */
export interface ReportSectionDetail {
  sectionKey: string;
  title: string;
  isFree: boolean;
  paid: boolean;
  content: string;
  sortOrder: number;
}

/**
 * 报告概览章节项（GET /reports/:id 内嵌）
 * 注意：概览接口不下发 isFree，锁态由 paid + lockedSectionKeys 判定
 */
export interface ReportOverviewSection {
  sectionKey: string;
  title: string;
  /** 未解锁付费章节 content 为 null */
  content: string | null;
  sortOrder: number;
  paid: boolean;
}

/** 报告详情（GET /reports/:id 概览 v2.1 权威出参） */
export interface Report {
  id: string;
  /** 关联测评记录（后端必填下发） */
  recordId: string;
  /** 报告编号（如 RPT-20260709-XXXX） */
  reportNo: string;
  mbtiType: string;
  /** 族群：后端由 mbtiType 推导下发，前端不得反解 */
  family: 'analyst' | 'diplomat' | 'sentinel' | 'explorer';
  /** 后端渲染好的摘要文案，前端不得拼接 */
  summary: string;
  /** 固定 4 项 EI/SN/TF/JP，后端下发 */
  dimensions: { dimension: string; left: string; right: string; score: number }[];
  /** 生成状态：含 pending */
  generateStatus: 'pending' | 'generating' | 'done' | 'failed';
  /** 概览章节列表（不含 isFree） */
  sections: ReportOverviewSection[];
  /** 未解锁的付费章节 key 列表 */
  lockedSectionKeys: string[];
  /** 是否已解锁完整报告 */
  isUnlocked: boolean;
  /** 北京时间字符串 */
  createdAt: string;
}

/** 深度生成触发响应 */
export interface GenerateDeepResult {
  reportId: string;
  generateStatus: 'done' | 'generating';
  taskId?: string;
  targetSections?: string[];
  message?: string;
}

/** 分享海报信息 */
export interface ReportShare {
  shareId: string;
  /** 海报图片地址（后端渲染 or 前端生成后回传） */
  posterUrl?: string;
  /** 分享短链 */
  shareUrl: string;
  qrcode?: string;
}

/** 生成报告免费预览段（超限 40003） */
export function createReport(recordId: string): Promise<Report> {
  return request<Report>({
    url: '/reports',
    method: 'POST',
    data: { recordId },
  });
}

/** 获取报告详情（未解锁付费段返回 40002） */
export function getReport(id: string): Promise<Report> {
  return request<Report>({ url: `/reports/${id}`, method: 'GET' });
}

/** 我的报告列表 */
export function listReports(page = 1, pageSize = 10): Promise<Paginated<Report>> {
  return request<Paginated<Report>>({
    url: '/reports',
    method: 'GET',
    params: { page, pageSize },
  });
}

/** 生成分享海报 */
export function shareReport(id: string): Promise<ReportShare> {
  return request<ReportShare>({
    url: `/reports/${id}/share`,
    method: 'POST',
  });
}

/** 支付成功后解锁完整报告付费段（T2-05） */
export function unlockReport(id: string): Promise<{ unlocked: boolean }> {
  return request<{ unlocked: boolean }>({
    url: `/reports/${id}/unlock`,
    method: 'POST',
  });
}

/** 导出报告 PDF（已解锁，返回二进制 Blob；T2-06） */
export function exportReport(id: string): Promise<Blob> {
  return request<Blob>({
    url: `/reports/${id}/export`,
    method: 'GET',
    responseType: 'blob',
  });
}

// ============ §6.1 新增端点（D4/D5） ============

/** 获取报告章节列表（§6.1 #2） */
export function getSections(id: string): Promise<ReportSectionItem[]> {
  return request<ReportSectionItem[]>({
    url: `/reports/${id}/sections`,
    method: 'GET',
  });
}

/** 获取章节详情（§6.1 #3） */
export function getSectionDetail(id: string, sectionKey: string): Promise<ReportSectionDetail> {
  return request<ReportSectionDetail>({
    url: `/reports/${id}/sections/${sectionKey}`,
    method: 'GET',
  });
}

/** 触发 LLM 深度生成（§6.1 #4） */
export function generateDeepContent(
  id: string,
  sections?: string[],
): Promise<GenerateDeepResult> {
  return request<GenerateDeepResult>({
    url: `/reports/${id}/generate`,
    method: 'POST',
    data: { sections },
  });
}