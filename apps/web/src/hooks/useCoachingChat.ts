/**
 * 辅导会话 WebSocket hook（P22）
 * -------------------------------------------------------------
 * 对齐后端实时网关（T4-05/06）契约：
 *   namespace: /ws/coaching
 *   握手鉴权: handshake.auth.token = <accessToken>
 *   ClientEvent:
 *     coaching:join     { sessionId, lastReceivedSeq? }  加入房间（带游标补发）
 *     coaching:message  { sessionId, clientMsgId, content } 发送消息
 *     coaching:ack      { seq }                            确认已收
 *   ServerEvent:
 *     coaching:joined   { sessionId }
 *     coaching:message  ServerMessage
 *     coaching:ack      { clientMsgId, seq }               我发的消息落库确认
 *     coaching:replay   ServerMessage[]                    断线补发
 *     coaching:error    { code, message }                  80001~80003
 *
 * 降级策略：
 *  - socket.io-client 未安装 / 连接失败 -> 自动降级为长轮询（HTTP 拉历史）。
 *  - 断线后按最后 seq 重连并请求 replay。
 *
 * TODO(blocked)：需安装 socket.io-client 依赖并配置 VITE_WS_URL。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken } from '../api';

/** WS 命名空间 */
const WS_NAMESPACE = '/ws/coaching';
/** 网关基址（默认与页面同源；生产需配 VITE_WS_URL） */
const WS_URL = import.meta.env.VITE_WS_URL ?? '';
/** 长轮询降级间隔（ms） */
const POLL_INTERVAL = 3000;

/** WS 事件名（对齐后端 realtime.constants） */
const EV = {
  JOIN: 'coaching:join',
  MESSAGE: 'coaching:message',
  ACK: 'coaching:ack',
  JOINED: 'coaching:joined',
  REPLAY: 'coaching:replay',
  ERROR: 'coaching:error',
} as const;

/** WS 业务错误码（对齐后端 apps/api/src/common/response.ts） */
export const WS_ERROR = {
  /** 未授权/握手 token 失效 */
  UNAUTHORIZED: 80001,
  /** 非订单双方，无权进入房间 */
  ROOM_FORBIDDEN: 80002,
  /** 会话不存在或已结束 */
  SESSION_INVALID: 80003,
} as const;

/** 服务端消息（对齐 ServerMessage shape） */
export interface ChatMessage {
  seq: number;
  clientMsgId?: string;
  sessionId: string;
  /** coach 辅导师 / user 我 / system 系统 */
  role: 'coach' | 'user' | 'system';
  content: string;
  createdAt: string;
  /** 本地发送中状态（仅前端） */
  pending?: boolean;
}

export type ConnState = 'connecting' | 'connected' | 'reconnecting' | 'polling' | 'closed';

export interface UseCoachingChatResult {
  messages: ChatMessage[];
  state: ConnState;
  /** WS 错误码（80001~80003），无错误为 null */
  errorCode: number | null;
  /** 发送消息 */
  send: (content: string) => void;
  /** 手动重连 */
  reconnect: () => void;
}

/** 生成幂等 clientMsgId */
function genClientMsgId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 订阅并管理一个辅导会话的实时消息。
 * @param sessionId 会话 ID（P22 路由参数）
 */
export function useCoachingChat(sessionId: string): UseCoachingChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<ConnState>('connecting');
  const [errorCode, setErrorCode] = useState<number | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const socketRef = useRef<any>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSeqRef = useRef<number>(0);
  const disposedRef = useRef(false);

  /** 合并消息并维护 lastSeq（按 seq 去重排序） */
  const mergeMessages = useCallback((incoming: ChatMessage[]) => {
    setMessages((prev) => {
      const map = new Map<number, ChatMessage>();
      for (const m of prev) if (m.seq) map.set(m.seq, m);
      for (const m of incoming) {
        if (m.seq) {
          map.set(m.seq, m);
          if (m.seq > lastSeqRef.current) lastSeqRef.current = m.seq;
        }
      }
      // 保留仍在 pending（无 seq）的本地消息
      const pendings = prev.filter((m) => !m.seq && m.pending);
      const merged = [...map.values()].sort((a, b) => a.seq - b.seq);
      return [...merged, ...pendings];
    });
  }, []);

  /** 长轮询降级：定时拉取历史（HTTP） */
  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    setState('polling');
    const poll = async () => {
      try {
        const { request } = await import('../api/client');
        const list = await request<ChatMessage[]>({
          url: `/coaches/sessions/${sessionId}/messages`,
          method: 'GET',
          params: { sinceSeq: lastSeqRef.current },
        });
        if (list?.length) mergeMessages(list);
      } catch {
        /* 轮询失败静默重试 */
      }
    };
    void poll();
    pollTimerRef.current = setInterval(poll, POLL_INTERVAL);
  }, [sessionId, mergeMessages]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  /** 建立 WS 连接（动态导入 socket.io-client，失败降级轮询） */
  const connect = useCallback(async () => {
    if (!sessionId || disposedRef.current) return;
    setState('connecting');
    setErrorCode(null);
    const token = getAccessToken();

    let io: unknown;
    try {
      // 动态导入以避免未安装依赖时阻塞编译；TODO(blocked)：npm i socket.io-client
      const mod = await import('socket.io-client');
      io = (mod as { io?: unknown }).io ?? (mod as { default?: unknown }).default;
    } catch {
      // 依赖缺失 -> 长轮询降级
      startPolling();
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const socket = (io as any)(`${WS_URL}${WS_NAMESPACE}`, {
        transports: ['websocket'],
        auth: { token },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setState('connected');
        stopPolling();
        socket.emit(EV.JOIN, { sessionId, lastReceivedSeq: lastSeqRef.current });
      });
      socket.on(EV.JOINED, () => setState('connected'));
      socket.on(EV.MESSAGE, (msg: ChatMessage) => {
        mergeMessages([msg]);
        socket.emit(EV.ACK, { seq: msg.seq });
      });
      socket.on(EV.REPLAY, (list: ChatMessage[]) => mergeMessages(list ?? []));
      socket.on(EV.ACK, (payload: { clientMsgId: string; seq: number }) => {
        // 我发的消息落库确认：用真实 seq 替换本地 pending
        setMessages((prev) =>
          prev.map((m) =>
            m.clientMsgId === payload.clientMsgId
              ? { ...m, seq: payload.seq, pending: false }
              : m,
          ),
        );
        if (payload.seq > lastSeqRef.current) lastSeqRef.current = payload.seq;
      });
      socket.on(EV.ERROR, (err: { code: number; message: string }) => {
        setErrorCode(err?.code ?? null);
        // 未授权 / 无权进入房间 / 会话失效 —— 均属不可恢复错误，停止重连
        if (
          err?.code === WS_ERROR.UNAUTHORIZED ||
          err?.code === WS_ERROR.ROOM_FORBIDDEN ||
          err?.code === WS_ERROR.SESSION_INVALID
        ) {
          socket.disconnect();
          setState('closed');
        }
      });
      socket.on('disconnect', () => {
        if (!disposedRef.current) setState('reconnecting');
      });
      socket.io?.on?.('reconnect_failed', () => startPolling());
      socket.on('connect_error', () => startPolling());
    } catch {
      startPolling();
    }
  }, [sessionId, mergeMessages, startPolling, stopPolling]);

  /** 发送消息（乐观更新 + WS emit；降级时走 HTTP） */
  const send = useCallback(
    (content: string) => {
      const text = content.trim();
      if (!text) return;
      const clientMsgId = genClientMsgId();
      const optimistic: ChatMessage = {
        seq: 0,
        clientMsgId,
        sessionId,
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      setMessages((prev) => [...prev, optimistic]);

      const socket = socketRef.current;
      if (socket?.connected) {
        socket.emit(EV.MESSAGE, { sessionId, clientMsgId, content: text });
      } else {
        // 降级：HTTP 发送
        void (async () => {
          try {
            const { request } = await import('../api/client');
            await request<void>({
              url: `/coaches/sessions/${sessionId}/messages`,
              method: 'POST',
              data: { clientMsgId, content: text },
            });
          } catch {
            /* 失败保留 pending，由轮询/重连补偿 */
          }
        })();
      }
    },
    [sessionId],
  );

  const reconnect = useCallback(() => {
    socketRef.current?.disconnect?.();
    socketRef.current = null;
    stopPolling();
    void connect();
  }, [connect, stopPolling]);

  useEffect(() => {
    disposedRef.current = false;
    void connect();
    return () => {
      disposedRef.current = true;
      socketRef.current?.disconnect?.();
      socketRef.current = null;
      stopPolling();
    };
  }, [connect, stopPolling]);

  return { messages, state, errorCode, send, reconnect };
}