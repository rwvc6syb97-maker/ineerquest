/**
 * 后端统一响应类型与业务码（对齐《需求文档-接口与测试用例权威规范.md》v2.0 权威契约）。
 * 契约字段严格一致：{ code, message, data, traceId }。
 *
 * 【错误码分段】(v2.0 权威)
 *   200        成功
 *   40xx       通用错误（4000 参数/4010 未登录/4011 Token 无效/4012 refresh 失效/4030 无权限/4040 不存在/4090 重复提交）
 *   41xx       认证账号域（4101 验证码错误/4102 发码频繁/4103 账密错误/4104 邮箱已注册/4105 封禁/4106 注销冷静期/4107 弱密码）
 *   42xx       测评域   43xx 报告域44xx 职业域   45xx AI 对话域
 *   46xx       激活码兑换域   47xx 辅导预约域   48xx 运营后台域
 *   50xx       系统/第三方（5000 内部/5001 DB/5002 第三方/5003 上游超时）
 *   9001       全局限流
 */

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T | null;
  traceId: string;
}

export const BizCode = {
  /** 成功（契约：code=200） */
  SUCCESS: 200,

  // ============ 通用错误 40xx ============
  /** 参数校验失败：入参缺失/类型错误/格式不合法 */
  BAD_REQUEST: 4000,
  /** 参数超长：字段超过最大长度限制 */
  PARAM_TOO_LONG: 4001,
  /** 请求体为空或非法 JSON */
  EMPTY_BODY: 4002,
  /** 未登录或登录已过期：无 Token / accessToken 失效 */
  UNAUTHORIZED: 4010,
  /** Token 无效：签名错误 / 已加入黑名单 */
  TOKEN_INVALID: 4011,
  /** refreshToken 失效：刷新令牌过期或被吊销 */
  REFRESH_TOKEN_INVALID: 4012,
  /** 无权限访问：越权 / 角色不足 */
  FORBIDDEN: 4030,
  /** 资源不存在：目标记录不存在或已软删除 */
  NOT_FOUND: 4040,
  /** 重复提交：幂等键命中 / 唯一约束冲突 */
  DUPLICATE_SUBMIT: 4090,

  // ============ 认证账号域 41xx ============
  /** 验证码错误或已过期（短信/邮箱通用） */
  SMS_CODE_INVALID: 4101,
  /** 验证码发送过于频繁（60s 内重复发送，短信/邮箱通用） */
  SMS_RATE_LIMITED: 4102,
  /** 账号或密码错误：邮箱登录凭证不符 */
  LOGIN_FAILED: 4103,
  /** 邮箱已注册：注册时唯一约束冲突 */
  EMAIL_ALREADY_REGISTERED: 4104,
  /** 账号已被封禁：user.status=2 */
  ACCOUNT_BANNED: 4105,
  /** 账号处于注销冷静期：已申请注销未撤销 */
  ACCOUNT_DEACTIVATING: 4106,
  /** 密码强度不足：不满足 8~32 位含字母数字 */
  PASSWORD_TOO_WEAK: 4107,

  // ============ 测评域 42xx ============
  /** 题库版本已失效：提交时版本与当前不符 */
  ASSESSMENT_VERSION_INVALID: 4201,
  /** 答卷不完整：缺题或某维度题量不达标 */
  ASSESSMENT_INCOMPLETE: 4202,
  /** 测评记录不存在：recordId 无效/非本人 */
  ASSESSMENT_RECORD_NOT_FOUND: 4203,
  /** 测评已提交，不可修改 */
  ASSESSMENT_STATUS_INVALID: 4204,
  /** 选项与题目不匹配：optionId 不属于该 questionId */
  ASSESSMENT_OPTION_MISMATCH: 4205,

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

  // ============ 职业域 44xx ============
  /** 无可用测评结果：用户未完成测评，无法推荐 */
  CAREER_NO_ASSESSMENT: 4401,
  /** 职业不存在：careerId 无效/已下架 */
  CAREER_NOT_FOUND: 4402,
  /** 已收藏：重复收藏 */
  CAREER_ALREADY_FAVORITED: 4403,
  /** 技能差距需登录并完成测评：缺档案数据 */
  CAREER_SKILL_GAP_NEED_ASSESSMENT: 4404,

  // ============ AI 对话域 45xx ============
  /** 超出每日对话配额：used ≥ dailyLimit */
  AI_QUOTA_LIMIT: 4501,
  /** 会话已达 50 轮上限：round ≥ 50 */
  AI_ROUND_LIMIT: 4502,
  /** 会话不存在：id 无效/非本人 */
  AI_SESSION_INVALID: 4503,
  /** 消息内容超长：content > 2000 */
  AI_CONTENT_TOO_LONG: 4504,
  /** AI 生成失败：Agnes AI 返回异常 */
  AI_GENERATE_FAILED: 4505,
  /** AI 响应超时：上游超时（映射 5003） */
  AI_TIMEOUT: 4506,

  // ============ 激活码兑换域 46xx ============
  /** 激活码无效：不存在/格式错误 */
  ACTIVATION_CODE_INVALID: 4601,
  /** 激活码已被使用：已核销 */
  ACTIVATION_CODE_USED: 4602,
  /** 激活码已过期：超有效期 */
  ACTIVATION_CODE_EXPIRED: 4603,
  /** 激活码已作废：被后台禁用 */
  ACTIVATION_CODE_DISABLED: 4604,
  /** 当前会员等级更高，无需降级兑换 */
  MEMBERSHIP_LEVEL_HIGHER: 4605,

  // ============ 辅导预约域 47xx ============
  /** 时段已被占用：并发抢占，锁失败（uk_coach_slot 防重叠） */
  COACH_SLOT_TAKEN: 4701,
  /** 规划师停止接单：coach.status≠1 */
  COACH_NOT_ACCEPTING: 4702,
  /** 会员权限不足：非辅导会员预约 */
  COACH_MEMBERSHIP_REQUIRED: 4703,
  /** 订单不存在：id 无效/非本人 */
  COACH_ORDER_NOT_FOUND: 4704,
  /** 订单状态不允许该操作：已完成订单取消等 */
  COACH_ORDER_STATUS_INVALID: 4705,
  /** 已评价，不可重复 */
  COACH_ALREADY_REVIEWED: 4706,
  /** 时段不存在或已过期：scheduleId 失效 */
  COACH_SLOT_NOT_FOUND: 4707,
  /** 规划师/辅导师不存在：coachId 无效或已下架 */
  COACH_NOT_FOUND: 4708,

  // ============ 运营后台域 48xx ============
  /** 后台账号或密码错误：登录失败 */
  ADMIN_LOGIN_FAILED: 4801,
  /** 权限点不足：RBAC 校验失败 */
  ADMIN_PERMISSION_DENIED: 4802,
  /** 目标记录被引用，无法删除：题目关联进行中测评 */
  ADMIN_RECORD_REFERENCED: 4803,
  /** 批量数量超限：count>1000 */
  ADMIN_BATCH_LIMIT: 4804,
  /** 敏感操作需二次确认：缺 confirm 标记 */
  ADMIN_CONFIRM_REQUIRED: 4805,

  // ============ 系统/第三方 50xx ============
  /** 系统内部错误：未捕获异常 */
  INTERNAL_ERROR: 5000,
  /** 数据库操作失败：DB 连接/事务异常 */
  DB_ERROR: 5001,
  /** 第三方服务调用失败：Agnes AI/短信/OSS 调用异常 */
  THIRD_PARTY_ERROR: 5002,
  /** 上游服务超时：第三方响应超时 */
  UPSTREAM_TIMEOUT: 5003,

  // ============ 全局限流 9001 ============
  /** 请求过于频繁：命中限流令牌桶 */
  RATE_LIMITED: 9001,

  // ============ 兼容别名（历史常量名 → 契约码）============
  // 说明：以下常量名为存量代码引用，值统一映射到 v2.0 契约码，避免破坏编译且返回契约码。
  /** 邮箱验证码错误或已过期（复用 4101） */
  EMAIL_CODE_INVALID: 4101,
  /** 邮箱验证码发送过于频繁（复用 4102） */
  EMAIL_RATE_LIMITED: 4102,
  /** 报告每日下载/生成上限（报告域独立码，与 REPORT_LOCKED 4302 区分语义） */
  REPORT_DAILY_LIMIT: 4306,
  /** 订单不存在或无权访问（复用辅导订单 4704） */
  ORDER_NOT_FOUND: 4704,
  /** 订单已关闭/状态不允许（复用 4705） */
  ORDER_CLOSED: 4705,
  /** 重复支付（幂等/重复提交 4090） */
  PAYMENT_DUP: 4090,
  /** 支付金额与订单不符（参数校验域 4000） */
  PAYMENT_AMOUNT_MISMATCH: 4000,
  /** 会员套餐已下架（资源不存在 4040） */
  MEMBERSHIP_PLAN_OFFLINE: 4040,
  /** 退款状态非法（订单状态不允许 4705） */
  REFUND_INVALID: 4705,
  /** 支付回调签名校验失败（无权限 4030） */
  PAYMENT_SIGN_INVALID: 4030,
  /** WS 握手鉴权失败（未登录 4010） */
  WS_UNAUTHORIZED: 4010,
  /** WS 无权访问房间（无权限 4030） */
  WS_ROOM_FORBIDDEN: 4030,
  /** WS 会话不存在或状态非法（复用会话不存在 4503） */
  WS_SESSION_INVALID: 4503,
  /** 后台账号非管理端/密码错误（复用 4801） */
  ADMIN_LOGIN_FORBIDDEN: 4801,
  /** 后台 token 作用域非 admin（越权 4030） */
  ADMIN_SCOPE_INVALID: 4030,
} as const;

/**
 * 通用码别名（保持向后引用兼容）：直接映射到 BizCode 契约码。
 * 说明：历史代码引用 CommonCode.BAD_REQUEST 等常量名，故保留别名，值已对齐契约。
 */
export const CommonCode = {
  BAD_REQUEST: BizCode.BAD_REQUEST,
  UNAUTHORIZED: BizCode.UNAUTHORIZED,
  FORBIDDEN: BizCode.FORBIDDEN,
  NOT_FOUND: BizCode.NOT_FOUND,
  INTERNAL_ERROR: BizCode.INTERNAL_ERROR,
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
 * 从而支持返回 4105(封禁) 等契约码，而不被通用 HTTP 码覆盖。
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