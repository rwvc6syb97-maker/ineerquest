/**
 * AI 对话 hooks（P15）
 * -------------------------------------------------------------
 * 提供：会话列表 / 新建 / 删除、消息历史、SSE 流式发送（打字机）、
 *       中断重连、轮次与配额提示。
 * 无真实后端时用 mock 兜底（沿用项目既有 mock 模式）。TODO(blocked)：联调后删除 fallback。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BizCode } from '@innerquest/shared';
import { aiChatApi } from '../api';
import type { AiConversation, AiMessage } from '../api/modules/ai-chat.api';
import { AI_MAX_ROUND } from '../api/modules/ai-chat.api';

export const aiChatKeys = {
  conversations: ['ai-chat', 'conversations'] as const,
  messages: (id: string) => ['ai-chat', 'messages', id] as const,
};

// ---------------- Mock 兜底 ----------------
function nowIso() {
  return new Date().toISOString();
}

// ---------------- 会话列表 / CRUD ----------------
/** 会话列表（真实接口，失败暴露错误态，不回退 mock） */
export function useConversations() {
  return useQuery<AiConversation[]>({
    queryKey: aiChatKeys.conversations,
    queryFn: async () => {
      // 真实接口失败直接抛出，交由 react-query error 态处理，禁止静默回退 mock 掩盖契约问题
      return await aiChatApi.listConversations();
    },
    staleTime: 60 * 1000,
  });
}

/** 会话操作（新建 / 删），维护 react-query 缓存 */
export function useConversationActions() {
  const qc = useQueryClient();

  const create = useCallback(
    async (title?: string): Promise<AiConversation> => {
      // 真实接口失败直接抛出，禁止造假 mock 会话掩盖后端异常
      const conv = await aiChatApi.createConversation(title);
      qc.setQueryData<AiConversation[]>(aiChatKeys.conversations, (prev) => [
        conv,
        ...(prev ?? []),
      ]);
      return conv;
    },
    [qc],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      try {
        await aiChatApi.deleteConversation(id);
      } catch {
        /* mock：仅更新本地缓存 */
      }
      qc.setQueryData<AiConversation[]>(aiChatKeys.conversations, (prev) =>
        (prev ?? []).filter((c) => c.id !== id),
      );
      qc.removeQueries({ queryKey: aiChatKeys.messages(id) });
    },
    [qc],
  );

  return { create, remove };
}

// ---------------- 消息流（SSE 打字机 + 中断重连） ----------------
export interface ChatMessage extends AiMessage {
  /** 是否处于流式渲染中（打字机进行时） */
  streaming?: boolean;
}

export interface UseChatStreamResult {
  messages: ChatMessage[];
  /** 当前轮次 */
  round: number;
  maxRound: number;
  /** 流式进行中 */
  isStreaming: boolean;
  /** 错误提示（含轮次上限 / 配额） */
  error: string | null;
  /** 是否为轮次上限（50002） */
  roundLimited: boolean;
  /** 是否为配额上限（50001） */
  quotaLimited: boolean;
  send: (content: string) => Promise<void>;
  /** 中断当前流 */
  abort: () => void;
  /** 重连：重发最后一条用户消息 */
  reconnect: () => Promise<void>;
}

/** 会话消息流管理（打字机渲染 + AbortController 中断 + 重连恢复） */
export function useChatStream(conversationId: string): UseChatStreamResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [round, setRound] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roundLimited, setRoundLimited] = useState(false);
  const [quotaLimited, setQuotaLimited] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastUserMsgRef = useRef<string>('');

  // 加载历史消息
  useEffect(() => {
    if (!conversationId) return;
    let alive = true;
    (async () => {
      try {
        const list = await aiChatApi.listMessages(conversationId);
        if (alive) setMessages(list);
      } catch {
        // 真实接口失败暴露错误态，禁止静默回退 mock 掩盖后端/契约问题
        if (alive) {
          setMessages([]);
          setError('历史消息加载失败，请稍后重试');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [conversationId]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    );
  }, []);

  const runStream = useCallback(
    async (content: string) => {
      setError(null);
      setRoundLimited(false);
      setQuotaLimited(false);
      lastUserMsgRef.current = content;

      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      // 占位：用户消息 + AI 流式消息
      const aiId = `stream-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: `u-${Date.now()}`,
          conversationId,
          role: 'user',
          content,
          createdAt: nowIso(),
        },
        { id: aiId, conversationId, role: 'assistant', content: '', createdAt: nowIso(), streaming: true },
      ]);

      const appendToken = (t: string) =>
        setMessages((prev) =>
          prev.map((m) => (m.id === aiId ? { ...m, content: m.content + t } : m)),
        );

      const finish = () => {
        setMessages((prev) =>
          prev.map((m) => (m.id === aiId ? { ...m, streaming: false } : m)),
        );
        setIsStreaming(false);
        setRound((r) => r + 1);
        abortRef.current = null;
      };

      const handleError = (err: { code?: number; message: string }) => {
        if (err.code === BizCode.AI_ROUND_LIMIT) setRoundLimited(true);
        if (err.code === BizCode.AI_QUOTA_LIMIT) setQuotaLimited(true);
        setError(err.message);
        setMessages((prev) =>
          prev.map((m) => (m.id === aiId ? { ...m, streaming: false } : m)),
        );
        setIsStreaming(false);
        abortRef.current = null;
      };

      try {
        await aiChatApi.streamMessage(
          conversationId,
          content,
          {
            onToken: appendToken,
            onDone: (p) => {
              if (p?.round != null) setRound(p.round);
              finish();
            },
            onError: handleError,
          },
          controller.signal,
        );
      } catch (err) {
        // 真实接口不可用 → 抛出错误交由 handleError 统一处理，不再静默 mock 掩盖
        const message = err instanceof Error ? err.message : 'AI 服务连接失败';
        handleError({ code: 50000, message });
      }
    },
    [conversationId],
  );

  const send = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;
      if (round >= AI_MAX_ROUND) {
        setRoundLimited(true);
        setError('本次对话已达 50 轮上限，请开启新会话或升级会员继续。');
        return;
      }
      await runStream(content.trim());
    },
    [isStreaming, round, runStream],
  );

  const reconnect = useCallback(async () => {
    if (lastUserMsgRef.current) await runStream(lastUserMsgRef.current);
  }, [runStream]);

  return {
    messages,
    round,
    maxRound: AI_MAX_ROUND,
    isStreaming,
    error,
    roundLimited,
    quotaLimited,
    send,
    abort,
    reconnect,
  };
}