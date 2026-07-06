/**
 * 后台激活码管理 API（Admin）
 * 对齐后端契约：
 *   POST /admin/activation-codes/generate        批量生成
 *   GET  /admin/activation-codes                  列表查询
 *   POST /admin/activation-codes/:id/send         发送激活码
 */
import { adminRequest } from '../admin-client';

export interface ActivationCodeItem {
  id: string;
  code: string;
  planCode: string;
  status: number;
  statusLabel: 'unused' | 'used' | 'expired';
  usedBy: string | null;
  usedAt: string | null;
  sentTo: string | null;
  sentChannel: number | null;
  expireAt: string | null;
  note: string | null;
  batchNo: string | null;
  createdAt: string;
}

export interface GenerateParams {
  planCode: string;
  count: number;
  expireDays?: number;
  note?: string;
}

export interface GenerateResult {
  batchNo: string;
  planCode: string;
  planName: string;
  count: number;
  expireAt: string | null;
  codes: string[];
}

export interface ListResult {
  total: number;
  page: number;
  pageSize: number;
  list: ActivationCodeItem[];
}

export interface SendParams {
  email?: string;
  phone?: string;
  channel: 1 | 2; // 1=email, 2=sms
}

/** 批量生成激活码 */
export function generateCodes(params: GenerateParams): Promise<GenerateResult> {
  return adminRequest<GenerateResult>({
    url: '/admin/activation-codes/generate',
    method: 'POST',
    data: params,
  });
}

/** 激活码列表 */
export function listCodes(params?: {
  planCode?: string;
  status?: number;
  batchNo?: string;
  page?: number;
  pageSize?: number;
}): Promise<ListResult> {
  return adminRequest<ListResult>({
    url: '/admin/activation-codes',
    method: 'GET',
    params,
  });
}

/** 发送激活码（邮件/SMS） */
export function sendCode(id: string, params: SendParams): Promise<{ sent: boolean; method: string; mock?: boolean }> {
  return adminRequest<{ sent: boolean; method: string; mock?: boolean }>({
    url: `/admin/activation-codes/${id}/send`,
    method: 'POST',
    data: params,
  });
}
