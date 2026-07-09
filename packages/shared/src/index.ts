/**
 * InnerQuest 向内求索 — 前后端共享类型与常量
 * 阶段 0 脚手架预留：统一响应结构 {code,message,data,traceId}
 */

/** 统一 API 响应结构（贯穿所有服务） */
export interface ApiResponse<T = unknown> {
  /** 业务状态码：0 表示成功，其余见 BizCode */
  code: number;
  /** 提示信息 */
  message: string;
  /** 业务数据载荷 */
  data: T | null;
  /** 全链路追踪 ID（Trace 中间件注入） */
  traceId: string;
}

/** 分页响应载荷 */
export interface Paginated<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 业务错误码基线（对齐计划文档 2.2 全局边界约束）
 * 后续各阶段补充完整码表。
 */
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
  /** OAuth 授权交换失败 */
  OAUTH_EXCHANGE_FAILED: 20006,
  /** 测评记录不存在或无权访问 */
  ASSESSMENT_RECORD_NOT_FOUND: 30001,
  /** 答卷不完整，无法提交计分 */
  ASSESSMENT_INCOMPLETE: 30002,
  /** 测评记录状态非法（如已提交后重复提交） */
  ASSESSMENT_STATUS_INVALID: 30003,
  /** 全局限流 100 次/分/用户 */
  RATE_LIMITED: 90001,
  /** 文件超限（≤10MB PDF/DOCX） */
  FILE_TOO_LARGE: 90003,
  // ============ 报告域 43xx ============
  /** 报告未生成：结果尚未产出报告 */
  REPORT_NOT_GENERATED: 4301,
  /** 章节未解锁：访问付费章节但未升级 Pro */
  REPORT_LOCKED: 4302,
  /** 报告生成中：重复触发生成 */
  REPORT_GENERATING: 4303,
  /** 报告生成失败：LLM 调用失败，可重试 */
  REPORT_GENERATE_FAILED: 4304,
  /** 章节不存在：sectionKey 非法 */
  REPORT_SECTION_NOT_FOUND: 4305,
  /** 每日 ≤ 3 份报告：报告生成次数达上限 */
  REPORT_DAILY_LIMIT: 4306,
  /** AI 对话 ≤ 50 轮 */
  AI_ROUND_LIMIT: 50002,
  /** AI 每日配额 */
  AI_QUOTA_LIMIT: 50001,
  /** 支付 15 分钟关单 */
  ORDER_CLOSED: 70001,
  /** 支付回调幂等冲突 */
  PAYMENT_DUP_CALLBACK: 70002,
  /** 支付金额不符 */
  PAYMENT_AMOUNT_MISMATCH: 70003,
  /** 会员套餐已下架，无法下单 */
  MEMBERSHIP_PLAN_OFFLINE: 70004,
} as const;

export type BizCodeValue = (typeof BizCode)[keyof typeof BizCode];

/** 业务码默认提示文案（可被具体场景覆盖） */
export const BizMessage: Record<number, string> = {
  [BizCode.SUCCESS]: 'ok',
  [BizCode.SMS_RATE_LIMITED]: '验证码发送过于频繁，请稍后再试',
  [BizCode.ACCOUNT_BANNED]: '账号已被封禁，请联系客服',
 [BizCode.SMS_CODE_INVALID]: '验证码错误或已过期',
  [BizCode.TOKEN_INVALID]: '登录状态已失效，请重新登录',
  [BizCode.ACCOUNT_DEACTIVATING]: '账号处于注销冷静期',
  [BizCode.OAUTH_EXCHANGE_FAILED]: '第三方授权失败',
  [BizCode.ASSESSMENT_RECORD_NOT_FOUND]: '测评记录不存在或无权访问',
  [BizCode.ASSESSMENT_INCOMPLETE]: '答卷未完成，请完成全部题目后再提交',
  [BizCode.ASSESSMENT_STATUS_INVALID]: '测评记录状态非法',
  [BizCode.RATE_LIMITED]: '请求过于频繁，请稍后再试',
  [BizCode.FILE_TOO_LARGE]: '文件超出大小限制',
  [BizCode.REPORT_NOT_GENERATED]: '报告尚未生成，请先完成测评',
  [BizCode.REPORT_LOCKED]: '该段落需解锁后查看',
  [BizCode.REPORT_GENERATING]: '报告正在生成中，请稍后查看',
  [BizCode.REPORT_GENERATE_FAILED]: '报告生成失败，请重试',
  [BizCode.REPORT_SECTION_NOT_FOUND]: '章节不存在',
  [BizCode.REPORT_DAILY_LIMIT]: '今日报告生成次数已达上限',
  [BizCode.AI_ROUND_LIMIT]: 'AI 对话轮次已达上限',
  [BizCode.AI_QUOTA_LIMIT]: 'AI 使用配额已用尽',
  [BizCode.ORDER_CLOSED]: '订单已关闭',
  [BizCode.PAYMENT_DUP_CALLBACK]: '支付回调重复',
  [BizCode.PAYMENT_AMOUNT_MISMATCH]: '支付金额不符，请刷新订单后重试',
  [BizCode.MEMBERSHIP_PLAN_OFFLINE]: '该套餐已下架，请选择其他套餐',
};

/** 通用失败码（HTTP 层映射用） */
export const CommonCode = {
  BAD_REQUEST: 40000,
  UNAUTHORIZED: 40100,
  FORBIDDEN: 40300,
  NOT_FOUND: 40400,
  INTERNAL_ERROR: 50000,
} as const;

/** 构造统一成功响应 */
export function ok<T>(data: T, traceId: string, message = 'ok'): ApiResponse<T> {
  return { code: BizCode.SUCCESS, message, data, traceId };
}

/** 构造统一失败响应 */
export function fail(code: number, message: string, traceId: string): ApiResponse<null> {
  return { code, message, data: null, traceId };
}

/** 服务模块基线（10 个，对齐计划文档 2.1） */
export const SERVICE_MODULES = [
  'user',
  'assessment',
  'report',
  'career',
  'ai-chat',
  'coaching',
  'payment',
  'ops',
  'llm-gateway',
  'realtime',
] as const;

export type ServiceModule = (typeof SERVICE_MODULES)[number];