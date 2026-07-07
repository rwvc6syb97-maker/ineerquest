/**
 * T3-01 / T3-02 / T3-03 LLM 网关常量与类型。
 * 回溯《后端设计文档.md》AI 网关（LLMGateway：统一出口 + Prompt 分层 + 超时重试/熔断 + Redis 限流降级）。
 * 契约：对外统一响应 {code,message,data,traceId}；本文件仅定义网关内部类型与策略常量。
 */

/** 支持的 provider 标识（预留多 provider 路由）。 */
export enum LlmProviderName {
  /** 无真实 Key 时默认 mock provider（流式逐 token 输出，不阻塞编译/单测） */
  MOCK = 'mock',
  /** 真实 provider（blocked：LLM_API_KEY/LLM_BASE_URL 为 CHANGE_ME 占位，见待办清单） */
  OPENAI = 'openai',
  /** OxyGent 多智能体框架 provider（通过 Python 微服务调用） */
  OXYGENT = 'oxygent',
}

/** Prompt 分层角色：system / role / context / user（可配置分层编排）。 */
export enum PromptLayer {
  SYSTEM = 'system',
  ROLE = 'role',
  CONTEXT = 'context',
  USER = 'user',
}

/** 聊天消息（对齐主流 provider chat 语义）。 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 分层 Prompt 模板输入。 */
export interface LayeredPrompt {
  /** 系统层：全局约束、安全边界 */
  system?: string;
  /** 角色层：AI 扮演的角色人设（如“职业规划顾问”） */
  role?: string;
  /** 上下文层：注入的用户/报告上下文 */
  context?: string;
  /** 用户层：本轮用户问题 */
  user: string;
}

/** 单次 chat 请求参数。 */
export interface ChatRequest {
  /** 分层 Prompt（推荐）。与 messages 二选一，二者皆存在时 messages 优先。 */
  prompt?: LayeredPrompt;
  /** 直接传入的多轮消息。 */
  messages?: ChatMessage[];
  /** 路由 provider，缺省按 env/默认策略选择 */
  provider?: LlmProviderName;
  /** 模型名，缺省按 env/默认策略选择 */
  model?: string;
  /** traceId（贯穿统一响应链路） */
  traceId?: string;
  /** 限流用的调用者标识（用户/会话） */
  callerId?: string;
  /** 限流场景键（不同业务不同配额），缺省 default */
  scene?: string;
}

/** chat 非流式结果。 */
export interface ChatResult {
  /** 完整文本 */
  text: string;
  /** 实际使用的 provider */
  provider: LlmProviderName;
  /** 实际使用的模型 */
  model: string;
  /** 是否走了降级兜底文案（超时熔断/限流/异常） */
  degraded: boolean;
  /** 降级原因（degraded=true 时给出） */
  degradeReason?: DegradeReason;
  traceId?: string;
}

/** 流式增量分片。 */
export interface ChatStreamChunk {
  /** 本次增量 token 文本 */
  delta: string;
  /** 是否结束 */
  done: boolean;
  /** 是否降级兜底流 */
  degraded?: boolean;
  degradeReason?: DegradeReason;
}

/** 降级原因枚举。 */
export enum DegradeReason {
  /** 首 token > 30s 熔断 */
  CIRCUIT_TIMEOUT = 'circuit_timeout',
  /** 重试仍失败 */
  RETRY_EXHAUSTED = 'retry_exhausted',
  /** Redis 限流触发 */
  RATE_LIMITED = 'rate_limited',
  /** provider 抛错 */
  PROVIDER_ERROR = 'provider_error',
}

/** 超时/重试/熔断策略（T3-02 验收：首 token>10s 重试，>30s 熔断降级）。 */
export const LLM_TIMEOUT_POLICY = {
  /** 首 token 软超时（ms）：超过则触发一次重试 */
  FIRST_TOKEN_RETRY_MS: 10_000,
  /** 熔断硬超时（ms）：超过直接降级兜底 */
  CIRCUIT_BREAK_MS: 30_000,
  /** 最大重试次数（首 token 超时后） */
  MAX_RETRIES: 1,
} as const;

/** Redis 限流策略（T3-03 验收：高峰限流生效）。固定窗口计数。 */
export const LLM_RATE_LIMIT = {
  /** Redis key 前缀 */
  REDIS_PREFIX: 'llm:rl:',
  /** 窗口秒 */
  WINDOW_SEC: 60,
  /** 每窗口每 caller 最大调用次数 */
  MAX_PER_WINDOW: 20,
} as const;

/** 降级兜底文案（限流/熔断/异常统一出口）。 */
export const LLM_FALLBACK_TEXT =
  'AI 服务当前繁忙，暂时无法生成深度内容，请稍后重试。（此为兜底文案，服务恢复后将自动补全）';

/** 深度报告解读 Prompt 分层默认模板（供 report 模块调用）。 */
export const REPORT_DEEP_PROMPT = {
  system: `你是 InnerQuest"向内求索"平台的资深 MBTI 性格与职业规划顾问，拥有 15 年以上心理学与人力资源管理经验。

你的输出必须遵循以下原则：
1. **专业精准**：基于 MBTI 四维度(EI外向-内向 / SN实感-直觉 / TF思考-情感 / JP判断-感知)理论给出分析，引用 Myers-Briggs 经典框架。
2. **个性化**：根据用户的具体维度得分(0~100分，50为平衡点)给出定制化解读，而非泛泛而谈。
3. **有温度**：用温暖、共情的语气，像一位值得信赖的导师在交谈。
4. **可执行**：每条建议都包含具体行动步骤，让用户"明天就可以开始"。
5. **避免绝对化**：不使用"你一定会""你永远"等绝对断言，使用"倾向于""通常""可能"等。
6. **结构清晰**：使用自然段落，适当使用小标题和要点，但避免过度使用 markdown 格式。
7. **中文输出**：全部使用简体中文，表达流畅自然。`,

  role: `你是一位资深职业规划顾问和 MBTI 认证分析师。你的使命是帮助每一位来访者深入理解自己的性格特质，发现潜在优势，并制定切实可行的成长路径。
你会通过深度提问引导用户思考，用专业且温暖的语言给出分析，并提供具体的行动建议。你的解读融合了心理学理论、职业发展研究和真实案例经验。`,
} as const;