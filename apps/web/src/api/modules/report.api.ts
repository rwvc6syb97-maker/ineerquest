/**
 * 报告服务 API
 * 对齐契约：
 *  POST /reports          生成免费预览段（日限 3 份，超限 40003）
 *  GET  /reports/:id      获取报告（未解锁付费段返回 40002）
 *  POST /reports/:id/share 生成分享/海报（report_share）
 */
import { request } from '../client';
import type { Paginated } from '@innerquest/shared';

/** 报告段落 */
export interface ReportSection {
  key: string;
  title: string;
  /** 免费段有内容；付费段未解锁时 locked=true 且 content 为空 */
  content: string;
  locked: boolean;
}

/** 报告详情 */
export interface Report {
  id: string;
  recordId: string;
  mbtiType: string;
  /** 族群：analyst/diplomat/sentinel/explorer */
  family: 'analyst' | 'diplomat' | 'sentinel' | 'explorer';
  summary: string;
  sections: ReportSection[];
  /** 四维度得分，供可视化 */
  dimensions: { dimension: string; left: string; right: string; score: number }[];
  createdAt: string;
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