/**
 * P22 辅导会话（/app/coaching/session/:sessionId）
 * -------------------------------------------------------------
 * 基于 useCoachingChat（WebSocket + 长轮询降级）渲染实时消息流。
 * - 消息气泡区分 coach / user / system + pending 发送态
 * - 顶部连接状态条：connecting/connected/reconnecting/polling/closed
 * - 底部输入框发送；WS 错误码 80001~80003 分流提示 + 重连
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCoachingChat, WS_ERROR, type ChatMessage, type ConnState } from '../../hooks/useCoachingChat';
import { SpringButton } from '../../components';
import { COLORS } from '../../theme/tokens';

/** 连接状态展示文案与色值 */
const STATE_META: Record<ConnState, { label: string; color: string }> = {
  connecting: { label: '连接中…', color: '#a3a3a3' },
  connected: { label: '已连接', color: '#16a34a' },
  reconnecting: { label: '重连中…', color: '#f59e0b' },
  polling: { label: '弱网模式（轮询）', color: '#f59e0b' },
  closed: { label: '连接已断开', color: '#dc2626' },
};

/** WS 错误码 -> 提示文案 */
function errorText(code: number | null): string | null {
  switch (code) {
    case WS_ERROR.UNAUTHORIZED:
      return '登录状态已失效，请重新登录后再进入会话。';
    case WS_ERROR.ROOM_FORBIDDEN:
      return '你无权进入该会话（仅限订单双方）。';
    case WS_ERROR.SESSION_INVALID:
      return '会话不存在或已结束。';
    default:
      return code ? '会话发生异常，请尝试重连。' : null;
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'system') {
    return (
      <div className="my-2 text-center">
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-400">{msg.content}</span>
      </div>
    );
  }
  const mine = msg.role === 'user';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[78%]">
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            mine ? 'text-white' : 'bg-white text-neutral-800 shadow-sm'
          } ${msg.pending ? 'opacity-60' : ''}`}
          style={mine ? { backgroundColor: COLORS.accent } : undefined}
        >
          {msg.content}
        </div>
        <div className={`mt-1 flex items-center gap-1 text-[11px] text-neutral-400 ${mine ? 'justify-end' : ''}`}>
          {msg.pending ? <span>发送中…</span> : <span className="font-mono">{fmtTime(msg.createdAt)}</span>}
        </div>
      </div>
    </div>
  );
}

export function CoachingSessionPage() {
  const { sessionId = '' } = useParams();
  const { messages, state, errorCode, send, reconnect } = useCoachingChat(sessionId);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const meta = STATE_META[state];
  const errMsg = useMemo(() => errorText(errorCode), [errorCode]);
  const canSend =
    state !== 'closed' &&
    errorCode !== WS_ERROR.UNAUTHORIZED &&
    errorCode !== WS_ERROR.ROOM_FORBIDDEN &&
    errorCode !== WS_ERROR.SESSION_INVALID;

  // 新消息自动滚到底
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text || !canSend) return;
    send(text);
    setDraft('');
  };

  return (
    <section className="mx-auto flex h-[calc(100vh-8rem)] max-w-2xl flex-col">
      {/* 连接状态条 */}
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
          <span className="text-sm text-neutral-600">{meta.label}</span>
        </div>
        {(state === 'closed' || state === 'reconnecting') && (
          <button
            type="button"
            onClick={reconnect}
            className="text-xs font-medium text-brand-primary-600 hover:underline"
          >
            重新连接
          </button>
        )}
      </div>

      {/* 错误提示 */}
      {errMsg ? (
        <div className="flex items-center justify-between gap-3 bg-red-50 px-4 py-2 text-sm text-red-600">
          <span>{errMsg}</span>
          {canSend ? (
            <button type="button" onClick={reconnect} className="shrink-0 font-medium underline">
              重连
            </button>
          ) : null}
        </div>
      ) : null}

      {/* 消息流 */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-neutral-50 px-4 py-4">
        {messages.length === 0 ? (
          <p className="mt-10 text-center text-sm text-neutral-400">还没有消息，打个招呼开始咨询吧～</p>
        ) : (
          messages.map((m) => <MessageBubble key={m.clientMsgId ?? m.seq} msg={m} />)
        )}
      </div>

      {/* 输入区 */}
      <div className="border-t border-neutral-200 bg-white px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            disabled={!canSend}
            placeholder={canSend ? '输入消息，Enter 发送…' : '会话已结束'}
            className="max-h-28 flex-1 resize-none rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-brand-primary-500 focus:outline-none focus:ring-2 focus:ring-brand-primary-500/20 disabled:bg-neutral-50 disabled:text-neutral-300"
          />
          <SpringButton variant="accent" disabled={!canSend || !draft.trim()} onClick={handleSend}>
            发送
          </SpringButton>
        </div>
      </div>
    </section>
  );
}

export default CoachingSessionPage;