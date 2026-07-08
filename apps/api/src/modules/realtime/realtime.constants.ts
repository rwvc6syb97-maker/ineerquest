/**
 * T4-05 / T4-06 · 实时通信服务常量与契约（Socket.IO Gateway）。
 *
 * WebSocket 通道不走 HTTP 响应拦截器，event 消息体自行定义结构（参考阶段3 SSE 手动流式思路）。
 * 契约稳定字段：客户端/服务端事件名、消息负载 shape、ACK 回执 shape。
 */

/** 辅导实时通信命名空间（namespace） */
export const COACHING_NAMESPACE = '/ws/coaching';

/** 房间名前缀：按 coachingSessionId 分房，辅导师与用户加入同一 room */
export function coachingRoom(sessionId: string): string {
  return `coaching:${sessionId}`;
}

/** 客户端 → 服务端 事件名 */
export const ClientEvent = {
  /** 加入辅导会话房间：{ sessionId, lastReceivedSeq? } */
  JOIN: 'coaching:join',
  /** 发送消息：{ sessionId, clientMsgId, content } */
  MESSAGE: 'coaching:message',
  /** 客户端对服务端下行消息的确认回执：{ seq } */
  ACK: 'coaching:ack',
} as const;

/** 服务端 → 客户端 事件名 */
export const ServerEvent = {
  /** 加入房间成功：{ sessionId, room, lastSeq }（含最新游标，便于对齐） */
  JOINED: 'coaching:joined',
  /** 下行消息（广播）：ServerMessage */
  MESSAGE: 'coaching:message',
  /** 服务端对客户端发送消息的 ACK 回执：{ clientMsgId, seq, serverMsgId, ts } */
  ACK: 'coaching:ack',
  /** 断线重连补发：{ messages: ServerMessage[], fromSeq } */
  REPLAY: 'coaching:replay',
  /** 错误事件：{ code, message }（业务码见 BizCode.WS_*） */
  ERROR: 'coaching:error',
} as const;

/** 消息发送方角色 */
export enum MsgSenderRole {
  USER = 'user',
  COACH = 'coach',
}

/** 服务端下行消息负载（落库 + 广播统一 shape） */
export interface ServerMessage {
  /** 会话内自增序号（游标，用于断线补发对齐） */
  seq: number;
  /** 服务端生成的消息唯一 id */
  serverMsgId: string;
  /** 客户端幂等 id（用于 ACK 去重回执） */
  clientMsgId: string;
  /** 辅导会话 id */
  sessionId: string;
  /** 发送方用户 id */
  senderId: string;
  /** 发送方角色 */
  senderRole: MsgSenderRole;
  /** 文本内容 */
  content: string;
  /** 服务端落库时间戳（ms） */
  ts: number;
}

/** ACK 重发与降级参数（T4-06） */
export const RELIABILITY = {
  /** 未收到客户端 ACK 的重发超时（ms） */
  ACK_TIMEOUT_MS: 5000,
  /** 单条消息最大重发次数（有限次数，避免风暴） */
  MAX_RESEND: 3,
  /** 断线补发单次最大条数 */
  MAX_REPLAY: 200,
  /**
   * 允许的传输通道：优先 websocket，polling 作为长轮询兜底。
   * WebSocket 不可用（防火墙/代理限制）时自动降级为 HTTP 长轮询，消息语义不变。
   */
  TRANSPORTS: ['websocket', 'polling'] as const,
} as const;