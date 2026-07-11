/**
 * AI 对话服务 API（P15）
 * -------------------------------------------------------------
 * 对齐后端 AI 对话服务（T3-04~T3-07）契约：
 *   POST   /conversations                 创建会话
 *   GET    /conversations                 会话列表
 *   GET    /conversations/:id/messages     消息历史
 *   DELETE /conversations/:id              删除会话
 *   POST   /conversations/:id/messages     发送消息（SSE 流式）
 *
 * 说明：
 *  - 普通 CRUD 走 axios（request，自动解包 {code,message,data,traceId}）。
 *  - SSE 流式必须用 fetch + ReadableStream（axios 不适合流式），
 *    在 streamMessage 中解析 event: message / done / error。
 *  - 错误码 50002 AI_ROUND_LIMIT（≥50 轮）、50001 AI_QUOTA_LIMIT（日配额）。
 */
import { request } from '../client';
import { getAccessToken } from '../token';

/** 单条对话消息 */
export interface AiMessage {
  id: string;
  conversationId: string;
  /** 角色：user 用户 / assistant AI */
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

/** 会话概要（列表 / 侧栏用） */
export interface AiConversation {
  id: string;
  title: string;
  /** 当前已发生轮次（一问一答记 1 轮） */
  round: number;
  /** 最大轮次上限（默认 50） */
  maxRound: number;
  createdAt: string;
  updatedAt: string;
}

/** 会话上限（与后端 ai_conversation.max_round 一致） */
export const AI_MAX_ROUND = 50;

/**
 * 后端会话原始出参（字段命名可能为 convNo / conversationId 等，需归一化为 id）。
 * BUG5：创建会话若不把 convNo→id 归一化，前端 setActiveId 拿到 undefined，
 * 右侧只显 EmptyState 且不渲染输入框。此处做防御性判空归一化。
 */
interface RawConversation {
  id?: string | number;
  convNo?: string | number;
  conversationId?: string | number;
  title?: string;
  round?: number;
  currentRound?: number;
  maxRound?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** 后端 → 前端 AiConversation 归一化（convNo/conversationId → id） */
function toConversation(raw: RawConversation): AiConversation {
  return {
    id: String(raw.id ?? raw.convNo ?? raw.conversationId ?? ''),
    title: raw.title ?? '新的对话',
    round: Number(raw.round ?? raw.currentRound ?? 0),
    maxRound: Number(raw.maxRound ?? AI_MAX_ROUND),
    createdAt: raw.createdAt ?? '',
    updatedAt: raw.updatedAt ?? raw.createdAt ?? '',
  };
}

/** 创会话（出参经 toConversation 归一化，确保 id 非空） */
export function createConversation(title?: string): Promise<AiConversation> {
  return request<RawConversation>({
    url: '/conversations',
    method: 'POST',
    data: { title: title ?? '新的对话' },
  }).then(toConversation);
}

/** 会话列表（出参经归一化，兼容 convNo→id） */
export function listConversations(): Promise<AiConversation[]> {
  return request<RawConversation[]>({ url: '/conversations', method: 'GET' }).then((list) =>
    Array.isArray(list) ? list.map(toConversation) : [],
  );
}

/** 消息历史 */
export function listMessages(conversationId: string): Promise<AiMessage[]> {
  return request<AiMessage[]>({
    url: `/conversations/${conversationId}/messages`,
    method: 'GET',
  });
}

/** 删除会话 */
export function deleteConversation(conversationId: string): Promise<void> {
  return request<void>({
    url: `/conversations/${conversationId}`,
    method: 'DELETE',
  });
}

/** SSE 事件类型（对齐后端 event 字段） */
export type SseEventType = 'message' | 'done' | 'error';

/** 流式回调集合 */
export interface StreamHandlers {
  /** 收到一个 token 增量（event: message） */
  onToken: (token: string) => void;
  /** 流正常结束（event: done） */
  onDone?: (payload?: { round?: number }) => void;
  /** 流内错误（event: error），code 为业务码（如 50001/50002） */
  onError?: (err: { code?: number; message: string }) => void;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

/** 解析单条 SSE 记录的 data 负载 */
function parseSsePayload(raw: string): { token?: string; round?: number; code?: number; message?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
  const obj = JSON.parse(trimmed);
    return {
      token: obj.token ?? obj.delta ?? obj.content,
      round: obj.round,
      code: obj.code,
      message: obj.message,
    };
  } catch {
    // 后端可能直接推送纯文本 token
    return { token: raw };
  }
}

/**
 * 发送消息并以 SSE 流式接收 AI 回复。
 * 使用 fetch + ReadableStream 逐块解析，逐 token 回调 onToken。
 * @param conversationId 会话 ID
 * @param content 用户消息
 * @param handlers 流式回调
 * @param signal AbortController.signal 用于中断
 */
export async function streamMessage(
  conversationId: string,
  content: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const token = getAccessToken();
  const resp = await fetch(`${BASE_URL}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ content }),
    signal,
  });

  if (!resp.ok || !resp.body) {
    // 非流式错误：尝试解析 JSON 业务码
    let code: number | undefined;
    let message = `请求失败（${resp.status}）`;
    try {
      const body = await resp.json();
      code = body.code;
      message = body.message ?? message;
    } catch {
      /* 忽略解析失败 */
    }
    handlers.onError?.({ code, message });
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent: SseEventType = 'message';

  // 处理一条完整的 SSE 记录（以空行分隔）
  const flushRecord = (record: string) => {
    let dataLine = '';
    for (const line of record.split('\n')) {
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim() as SseEventType;
      } else if (line.startsWith('data:')) {
        dataLine += line.slice(5).trim();
      }
    }
    const payload = parseSsePayload(dataLine);
    if (currentEvent === 'error') {
      handlers.onError?.({ code: payload.code, message: payload.message ?? 'AI 服务异常' });
    } else if (currentEvent === 'done') {
      handlers.onDone?.({ round: payload.round });
    } else if (payload.token) {
      handlers.onToken(payload.token);
    }
    currentEvent = 'message';
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      // SSE 记录以 \n\n 分隔
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const record = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        if (record.trim()) flushRecord(record);
      }
    }
    if (buffer.trim()) flushRecord(buffer);
    handlers.onDone?.();
  } catch (err) {
    // AbortError 属于主动中断，不视为错误
    if ((err as Error)?.name === 'AbortError') return;
    handlers.onError?.({ message: (err as Error)?.message ?? '连接中断' });
  }
}