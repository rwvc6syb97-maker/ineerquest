/**
 * 运营后台 - 用户管理 API（T4-18 / P34）
 * -------------------------------------------------------------
 * 对齐后端 ops/users controller：
 *   GET  /admin/users            列表（user:read；脱敏，user:pii 权限返回明文）
 *                                参数 status/role/keyword/page/pageSize
 *   POST /admin/users/:id/ban    封禁（user:ban；BanUserDto：reason 必填 + confirm=true）
 *   POST /admin/users/:id/unban  解封（user:ban）
 *   GET  /admin/users/:id        详情（user:read；latestReport + dimensions）
 */
import { adminRequest } from '../admin-client';
import { adminHttp } from '../admin-client';

/** 用户状态：1 正常 / 0 封禁 / 2 注销中 */
export type UserStatus = 0 | 1 | 2;

/** 后台用户列表项（手机号默认脱敏，如 138****8000） */
export interface AdminUser {
  id: string;
  nickname: string;
/** 手机号（无 user:pii 权限时为脱敏值） */
  phone: string;
  /** 邮箱（后端已按 user:pii 权限脱敏，前端直接展示；可能缺失） */
  email?: string;
  /** 是否已脱敏（true=当前展示的是脱敏值） */
  masked: boolean;
  status: UserStatus;
  role: number;
  /** 是否付费用户 */
  paid: boolean;
  registeredAt: string;
  lastActiveAt?: string;
  /** 封禁原因（status=0 时有值） */
  banReason?: string;
}

/** 列表查询参数 */
export interface ListUsersParams {
  status?: UserStatus;
  role?: number;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 列表返回（分页） */
export interface UserListResult {
  total: number;
  page: number;
  pageSize: number;
  list: AdminUser[];
}

/** 封禁请求体（对齐 BanUserDto：reason 必填，confirm 必须为 true） */
export interface BanUserParams {
  reason: string;
  confirm: true;
}

export function listUsers(params?: ListUsersParams): Promise<UserListResult> {
  return adminRequest<UserListResult>({ url: '/admin/users', method: 'GET', params });
}

export function banUser(id: string, body: BanUserParams): Promise<void> {
  return adminRequest<void>({ url: `/admin/users/${id}/ban`, method: 'POST', data: body });
}

export function unbanUser(id: string): Promise<void> {
  return adminRequest<void>({ url: `/admin/users/${id}/unban`, method: 'POST' });
}

/** 维度枚举（EI/SN/TF/JP） */
export type MbtiDimension = 'EI' | 'SN' | 'TF' | 'JP';

/** 单维度得分（score 0~100，>50 偏右极，<50 偏左极） */
export interface UserDimension {
  dimension: MbtiDimension;
  score: number;
}

/** 用户最新报告摘要（无报告时整体为 null） */
export interface UserLatestReport {
  mbtiType: string;
  reportNo: string;
  reportType: string;
  createdAt: string;
}

/** 用户详情（GET /admin/users/:id）：在列表项基础上附最新报告 + 四维度 */
export interface AdminUserDetail extends AdminUser {
  /** 最新报告摘要，无报告为 null */
  latestReport: UserLatestReport | null;
  /** MBTI 四维度得分（EI/SN/TF/JP），无报告时通常为空数组 */
  dimensions: UserDimension[];
}

export function getUser(id: string): Promise<AdminUserDetail> {
  return adminRequest<AdminUserDetail>({ url: `/admin/users/${id}`, method: 'GET' });
}

/** 文件流下载结果：blob + 从响应头解析出的文件名（可能缺失，交由调用方兜底） */
export interface ExportFileResult {
  blob: Blob;
  filename?: string;
}

/**
 * 从 Content-Disposition 头解析文件名。
 * 兼容 `filename*=UTF-8''xxx`（RFC5987，优先）与普通 `filename="xxx"`。
 */
function parseFilename(disposition?: string): string | undefined {
  if (!disposition) return undefined;
  // RFC5987：filename*=UTF-8''%E4%B8%AD%E6%96%87.pdf
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposition);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].replace(/^"|"$/g,''));
    } catch {
      /* 解码失败则回退普通字段 */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain?.[1];
}

/**
 * 单用户报告导出（PDF 详版：最新 MBTI 报告全文 + 四维度）。
 * GET /admin/users/:id/report/export?format=pdf → application/pdf 文件流。
 * 走 blob 响应类型，避免命中 JSON 契约解包。
 */
export async function exportUserReport(id: string): Promise<ExportFileResult> {
  const resp = await adminHttp.request<Blob>({
    url: `/admin/users/${id}/report/export`,
    method: 'GET',
    params: { format: 'pdf' },
    responseType: 'blob',
  });
  return { blob: resp.data, filename: parseFilename(resp.headers?.['content-disposition']) };
}

/**
 * 批量用户汇总导出（xlsx：UTF-8 BOM CSV，Excel 可直开），复用当前列表筛选条件。
 * GET /admin/users/export?format=xlsx&status=&role=&keyword= → 文件流。
 */
export async function exportUsers(params?: ListUsersParams): Promise<ExportFileResult> {
  const resp = await adminHttp.request<Blob>({
    url: '/admin/users/export',
    method: 'GET',
    params: { format: 'xlsx', ...(params ?? {}) },
    responseType: 'blob',
  });
  return { blob: resp.data, filename: parseFilename(resp.headers?.['content-disposition']) };
}