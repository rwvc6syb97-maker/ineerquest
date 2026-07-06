/**
 * T3-04 ~ T3-07 · AI 对话服务常量与类型。
 * 回溯《数据库设计文档.md》8.1 ai_conversation / 8.3 ai_conversation_summary，
 * 《技术架构设计文档.md》AI 对话（≤50 轮、SSE 流式、上下文压缩），
 * 错误码 50001/50002 见 common/response.ts BizCode。
 *
 * 约束：会话元数据落 MySQL(Prisma ai_conversation)；消息流落 MongoDB(集合 ai_message)；
 * 缺 Redis/Mongo 实例时降级放行（标 blocked，见《阶段3-人工调试待办清单.md》）。
 */

/** 会话状态：1 进行中 2 已结束 3 已达上限。 */
export enum ConversationStatus {
  ACTIVE = 1,
  ENDED = 2,
  ROUND_LIMIT = 3,
}

/** 会话场景：1 报告解读 2 职业咨询 3 自由对话。 */
export enum ConversationScene {
  REPORT = 1,
  CAREER = 2,
  FREE = 3,
}

/** 消息角色：1 用户 2 AI 助手 3 系统。 */
export enum MessageRole {
  USER = 1,
  ASSISTANT = 2,
  SYSTEM = 3,
}

/** MongoDB 消息集合名（消息流落 Mongo）。 */
export const AI_MESSAGE_COLLECTION = 'ai_message';

/** T3-07 单会话最大轮次（≤50）。超出返回 50002。 */
export const MAX_ROUND = 50;

/** T3-07 每日每用户对话配额（轮次）。超出返回 50001。 */
export const DAILY_QUOTA = 200;

/** T3-07 Redis 配额计数 key 前缀与窗口。 */
export const QUOTA_REDIS = {
  /** 每日配额计数前缀：ai:quota:{yyyyMMdd}:{userId} */
  DAILY_PREFIX: 'ai:quota:',
  /** 日计数过期秒（26h 冗余，跨时区安全） */
  DAILY_TTL_SEC: 26 * 3600,
} as const;

/** T3-06 上下文压缩策略。 */
export const CONTEXT_POLICY = {
  /** 触发摘要的轮次阈值：历史轮次超过则压缩早期消息 */
  SUMMARIZE_AFTER_ROUND: 10,
  /** 摘要后保留的最近原始轮次数（其余压入摘要） */
  KEEP_RECENT_ROUND: 6,
  /** 单次入模上下文的近似 token 上限（粗估 = 字符数/1） */
  MAX_CONTEXT_TOKEN: 4000,
  /** 摘要文本近似 token 上限 */
  MAX_SUMMARY_TOKEN: 600,
} as const;

/** AI 对话默认 system/role prompt（分层编排的固定层）。 */
export const AI_CHAT_SYSTEM_PROMPT =
  '你是 InnerQuest「向内求索」平台的职业规划顾问，基于用户的 MBTI 人格与职业情境，给出理性、共情、可执行的建议。';

/** 会话对外视图（隐藏自增 id，仅暴露 convNo）。 */
export interface ConversationView {
  convNo: string;
  scene: number;
  title: string | null;
  roundCount: number;
  maxRound: number;
  status: number;
  lastMsgAt: Date | null;
  createdAt: Date;
}

/** 消息对外视图（Mongo 文档投影）。 */
export interface MessageView {
  roundNo: number;
  role: number;
  content: string;
  model: string | null;
  createdAt: Date;
}

/** Mongo 消息文档结构。 */
export interface MessageDoc {
  conversationId: string;
  userId: string;
  roundNo: number;
  role: number;
  content: string;
  tokenCount: number;
  model: string | null;
  createdAt: Date;
}

/** 粗略 token 估算（无 tokenizer 依赖，用字符数近似，不阻塞编译/单测）。 */
export function estimateTokens(text: string): number {
  return text ? text.length : 0;
}