/**
 * 后端统一响应类型与业务码（与 @innerquest/shared 对齐的本地副本）。
 * 说明：shared 为 ESM 包，后端为 CommonJS，阶段 0 采用本地副本避免构建耦合，
 * 契约字段严格一致：{ code, message, data, traceId }。
 */

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T | null;
  traceId: string;
}

export const BizCode = {
  SUCCESS: 0,
  /** 短信验证码发送过于频繁（1 次/60s） */
  SMS_RATE_LIMITED: 20001,
  /** 账号被封禁 */
  ACCOUNT_BANNED: 20002,
  /** 验证码错误或已过期 */
  SMS_CODE_INVALID: 20003,
  /** Token 无效或已过期（含黑名单命中） */
  TOKEN_INVALID: 20004,
  /** 账号处于注销冷静期 */
  ACCOUNT_DEACTIVATING: 20005,
  /** 邮箱已被注册 */
  EMAIL_ALREADY_REGISTERED: 20006,
  /** 登录凭据错误（邮箱密码不匹配等） */
  LOGIN_FAILED: 20007,
  /** 邮箱验证码发送过于频繁（1 次/60s） */
  EMAIL_RATE_LIMITED: 20008,
  /** 邮箱验证码错误或已过期 */
  EMAIL_CODE_INVALID: 20009,
  /** 测评记录不存在或无权访问 */
  ASSESSMENT_RECORD_NOT_FOUND: 30001,
  /** 答卷不完整，无法提交计分 */
  ASSESSMENT_INCOMPLETE: 30002,
  /** 测评记录状态非法（如已提交后重复提交） */
  ASSESSMENT_STATUS_INVALID: 30003,
  RATE_LIMITED: 90001,
  FILE_TOO_LARGE: 90003,
  /** 报告付费段落未解锁 */
  REPORT_LOCKED: 40002,
  REPORT_DAILY_LIMIT: 40003,
  AI_ROUND_LIMIT: 50002,
  AI_QUOTA_LIMIT: 50001,
  /** 咨询时段已被占用（时段锁冲突 / uk_coach_slot 防重叠） */
  COACH_SLOT_TAKEN: 60001,
  /** 辅导师已停止接单（下架 / 未审核通过） */
  COACH_NOT_ACCEPTING: 60002,
  /** 订单已关闭（15 分钟超时或主动关单）*/
  ORDER_CLOSED: 70001,
  /** 重复支付 */
  PAYMENT_DUP: 70002,
  /** 支付金额与订单不符 */
  PAYMENT_AMOUNT_MISMATCH: 70003,
  /** 会员套餐已下架，无法下单 */
  MEMBERSHIP_PLAN_OFFLINE: 70004,
  /** 订单不存在或无权访问 */
  ORDER_NOT_FOUND: 70005,
  /** 退款状态非法（如重复退款/超额退款）*/
  REFUND_INVALID: 70006,
  /** 支付回调签名校验失败 */
  PAYMENT_SIGN_INVALID: 70007,
  /** 实时通信：握手鉴权失败（无 token / token 非法 / 非 access） */
  WS_UNAUTHORIZED: 80001,
  /** 实时通信：无权访问该辅导会话房间（非订单双方） */
  WS_ROOM_FORBIDDEN: 80002,
  /** 实时通信：辅导会话不存在或状态非法 */
  WS_SESSION_INVALID: 80003,
  /** 运营后台：账号非管理端角色，无权登录后台（T4-10） */
  ADMIN_LOGIN_FORBIDDEN: 21001,
  /** 运营后台：token 作用域非 admin（C 端 token 越权访问后台，T4-10） */
  ADMIN_SCOPE_INVALID: 21002,
  /** 运营后台：权限点不足，越权访问（RBAC 403，T4-10） */
  ADMIN_PERMISSION_DENIED: 21003,
} as const;

export const CommonCode = {
  BAD_REQUEST: 40000,
  UNAUTHORIZED: 40100,
  FORBIDDEN: 40300,
  NOT_FOUND: 40400,
  INTERNAL_ERROR: 50000,
} as const;

export function ok<T>(data: T, traceId: string, message = 'ok'): ApiResponse<T> {
  return { code: BizCode.SUCCESS, message, data, traceId };
}

export function fail(code: number, message: string, traceId: string): ApiResponse<null> {
  return { code, message, data: null, traceId };
}

/**
 * 业务异常：携带业务码与 HTTP 状态。
 * AllExceptionFilter 会识别并输出 { code, message, data:null, traceId }，
 * 从而支持返回 20002(封禁) 等业务码，而不被通用 HTTP 码覆盖。
 */
export class BizException extends Error {
  constructor(
    public readonly bizCode: number,
    message: string,
    public readonly httpStatus: number = 200,
  ) {
    super(message);
    this.name = 'BizException';
  }
}