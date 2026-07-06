/**
 * P15 AI 深度对话页（/app/coaching）
 * -------------------------------------------------------------
 * 左侧会话列表侧栏（新建 / 切换 / 删除），右侧对话流。
 * 关键能力（T3-08 验收）：
 *  - 流式逐字渲染（打字机效果）：useChatStream 逐 token 追加
 *  - 中断重连：AbortController 中断 + 重发最后一条消息恢复
 *  - 轮次提示：展示 round/50，接近或超限（50002）友好提示；配额超限（50001）提示
 *  - 会话列表 / 新建 / 删除
 * 真实接口未联通时自动 mock fallback（见 useAiChat）。
 */
import { useEffect, useRef, useState } from 'react';
import { SectionHeading, EmptyState } from '../../components';
import { COLORS } from '../../theme/tokens';
import {
  useConversations,
  useConversationActions,
  useChatStream,
} from '../../hooks/useAiChat';

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

/** 单会话对话面板（打字机 / 轮次 / 中断重连） */
function ChatPane({ conversationId }: { conversationId: string }) {
  const {
    messages,
    round,
    maxRound,
    isStreaming,
    error,
    roundLimited,
    quotaLimited,
    send,
    abort,
    reconnect,
  } = useChatStream(conversationId);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // 消息更新时滚到底部
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const nearLimit = round >= maxRound - 5 && round < maxRound;
  const reachedLimit = round >= maxRound || roundLimited;
  const disabled = isStreaming || reachedLimit || quotaLimited;

  const submit = () => {
    if (!input.trim()) return;
    send(input);
    setInput('');
  };

  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      {/* 轮次提示条 */}
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5 text-xs">
        <span className="font-mono text-neutral-500">
          轮次 <span className="tabular-nums" style={{ color: nearLimit || reachedLimit ? COLORS.accent : undefined }}>{Math.min(round, maxRound)}</span> / {maxRound}
        </span>
        {isStreaming && (
          <button type="button" onClick={abort} className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600 hover:bg-neutral-200">
            停止生成
          </button>
        )}
      </div>

      {/* 消息流 */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
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
              {m.streaming && (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle" style={{ backgroundColor: COLORS.accent }} />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 提示区：轮次 / 配额 / 错误 */}
      {(reachedLimit || quotaLimited || error) && (
        <div className="border-t border-neutral-100 px-4 py-2.5 text-xs">
          {quotaLimited ? (
            <p style={{ color: COLORS.accent }}>今日 AI 使用配额已用尽，明日再来或升级会员获取更多额度。</p>
          ) : reachedLimit ? (
            <p style={{ color: COLORS.accent }}>本次对话已达 {maxRound} 轮上限，请新建会话或升级会员继续深入。</p>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-red-500">{error}</span>
              <button type="button" onClick={reconnect} className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-700 hover:bg-neutral-200">
                重连并重试
              </button>
            </div>
          )}
        </div>
      )}
      {nearLimit && !reachedLimit && (
        <div className="border-t border-neutral-100 px-4 py-2 text-xs text-neutral-500">
          即将接近 {maxRound} 轮上限，注意收敛你的核心问题。
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