/**
 * P15 AI 深度对话页（/app/coaching）
 * -------------------------------------------------------------
 * 左侧会话列表侧栏（新建 / 切换 / 删除），右侧对话流。
 * 关键能力（L-P0-2 深度个性化问答）：
 *  - 发送走新契约 SSE 接口 POST /ai/chat/personalized（usePersonalizedChat）
 *  - 流式逐字渲染（打字机）：onDelta 逐段追加；degraded=true 仍正常展示 + 轻量降级提示
 *  - 会话管理与历史仍走 /conversations 系列（AiConversation.id 即后端 convNo）
 *  - 错误码分流：4504 超长 / 4502 轮次上限 / 4501 配额用尽（文案优先后端 message）
 * 全走真实接��，禁止 mock 兜底掩盖契约。
 */
import { useEffect, useRef, useState } from 'react';
import { SectionHeading, EmptyState } from '../../components';
import { COLORS } from '../../theme/tokens';
import { BizCode } from '@innerquest/shared';
import { aiChatApi } from '../../api';
import type { AiMessage } from '../../api/modules/ai-chat.api';
import {
  useConversations,
  useConversationActions,
} from '../../hooks/useAiChat';
import { usePersonalizedChat } from '../../hooks/useAiPlus';

export function AiChatPage() {
  const { data: conversations = [], isLoading } = useConversations();
  const { create, remove } = useConversationActions();
  const [activeId, setActiveId] = useState<string>('');

  // 默认选中第一个会话
  useEffect(() => {
    if (!activeId && conversations.length) setActiveId(conversations[0].id);
  }, [conversations, activeId]);

  const handleNew = async () => {
    const conv = await create();
    setActiveId(conv.id);
  };

  const handleDelete = async (id: string) => {
    await remove(id);
    if (id === activeId) setActiveId('');
  };

  return (
    <section className="mx-auto max-w-6xl pb-10">
      <SectionHeading
        size="lg"
        eyebrow="AI COACHING"
        title="职业深度对话"
        subtitle="与 AI 规划伙伴多轮探索你的方向——它会记住上下文，逐字回应你。"
      />

      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-[240px_1fr]">
        {/* ============ 会话侧栏 ============ */}
        <aside className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleNew}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: COLORS.brand }}
          >
            + 新建会话
          </button>
          <div className="flex flex-col gap-1.5">
            {isLoading ? (
              <p className="px-2 text-sm text-neutral-400">加载中…</p>
            ) : (
              conversations.map((c) => {
                const active = c.id === activeId;
                return (
                  <div
                    key={c.id}
                    className={`group flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                      active ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveId(c.id)}
                      className="min-w-0 flex-1 truncate text-left"
                    >
                      {c.title}
                    </button>
                    <button
                      type="button"
                      aria-label="删除会话"
                      onClick={() => handleDelete(c.id)}
                      className={`ml-2 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 ${
                        active ? 'text-neutral-300 hover:text-white' : 'text-neutral-400 hover:text-neutral-700'
                      }`}
                    >
                      ✕
                    </button>
                 </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ============ 对话区 ============ */}
        {activeId ? (
          <ChatPane key={activeId} conversationId={activeId} />
        ) : (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-neutral-200 py-20">
            <EmptyState
              icon="sparkle"
              title="选择或新建一个会话"
              description="开启一段属于你的职业探索对话。"
            />
          </div>
        )}
      </div>
    </section>
  );
}

/** 单会话对话面板（新契约 SSE 打字机 / degraded 降级 / 错误码分流） */
function ChatPane({ conversationId }: { conversationId: string }) {
  // conversationId 即后端 convNo（AiConversation.id 已在 api 层归一化 convNo→id）
  const { answer, streaming, degraded, error, errorCode, send, abort } = usePersonalizedChat();
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  // 记录本轮已定稿的 answer，避免重复入库到 messages
  const committedRef = useRef(false);

  // 加载历史消息（真实接口，失败暴露错误态，禁止 mock 兜底）
  useEffect(() => {
    if (!conversationId) return;
    let alive = true;
    setHistoryError(null);
    (async () => {
      try {
        const list = await aiChatApi.listMessages(conversationId);
        if (alive) setMessages(list);
      } catch {
        if (alive) {
          setMessages([]);
          setHistoryError('历史消息加载失败，请稍后重试');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [conversationId]);

  // 流式结束（streaming false 且有 answer）后把 AI 回答落入消息列表
  useEffect(() => {
    if (!streaming && answer && !committedRef.current) {
      committedRef.current = true;
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          conversationId,
          role: 'assistant',
          content: answer,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  }, [streaming, answer, conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, answer]);

  const roundLimited = errorCode === BizCode.AI_ROUND_LIMIT;
  const quotaLimited = errorCode === BizCode.AI_QUOTA_LIMIT;
  const disabled = streaming || roundLimited || quotaLimited;

  const submit = () => {
    const content = input.trim();
    if (!content || disabled) return;
    // 先把用户消息入列，重置本轮定稿标记
    committedRef.current = false;
    setMessages((prev) => [
      ...prev,
      {
        id: `u-${Date.now()}`,
        conversationId,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      },
    ]);
    void send({ convNo: conversationId, content });
    setInput('');
  };

  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      {/* 顶部：停止生成 + degraded 提示 */}
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5 text-xs">
        <span className="font-mono text-neutral-500">职业深度对话</span>
        {streaming && (
          <button type="button" onClick={abort} className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600 hover:bg-neutral-200">
            停止生成
          </button>
        )}
      </div>

      {/* 消息流 */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {historyError && (
          <p className="text-center text-xs text-red-500">{historyError}</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'rounded-br-sm bg-neutral-900 text-white'
                  : 'rounded-bl-sm bg-neutral-100 text-neutral-800'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {/* 流式进�中的 AI 回答（打字机） */}
        {streaming && (
          <div className="flex justify-start">
            <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-2.5 text-sm leading-relaxed text-neutral-800">
              {answer}
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle" style={{ backgroundColor: COLORS.accent }} />
            </div>
          </div>
        )}
      </div>

      {/* degraded 轻量提示（绝不白屏，仍展示上方内容） */}
      {degraded && (
        <div className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-700">
          AI 服务当前处于降级模式，以上内容为简化生成，可稍后重试获取更完整的回答。
        </div>
      )}

      {/* 错误分流：配额 / 轮次 / 其他（文案优先后端 message） */}
      {error && (
        <div className="border-t border-neutral-100 px-4 py-2.5 text-xs">
          {quotaLimited ? (
            <p style={{ color: COLORS.accent }}>{error || '今日 AI 使用配额已用尽，明日再来或升级会员获取更多额度。'}</p>
          ) : roundLimited ? (
            <p style={{ color: COLORS.accent }}>{error || '本次对话已达轮次上限，请新建会话或升级会员继续深入。'}</p>
          ) : (
            <p className="text-red-500">{error}</p>
          )}
        </div>
      )}

      {/* 输入区 */}
      <div className="flex items-end gap-2 border-t border-neutral-100 px-4 py-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!disabled) submit();
            }
          }}
          rows={1}
          placeholder={disabled ? '当前无法发送' : '输入你的问题，Enter 发送，Shift+Enter 换行…'}
          disabled={disabled}
          className="max-h-32 flex-1 resize-none rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:border-brand-primary-500 focus:outline-none focus:ring-2 focus:ring-brand-primary-500/20 disabled:bg-neutral-50 disabled:text-neutral-400"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !input.trim()}
          className="shrink-0 rounded-xl px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
          style={{ backgroundColor: COLORS.brand }}
        >
          发送
        </button>
      </div>
    </div>
  );
}

export default AiChatPage;