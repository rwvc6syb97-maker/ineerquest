/**
 * P26 我的辅导（/app/coaching/orders）
 * -------------------------------------------------------------
 * 展示咨询订单列表：状态标签、进入会话（P22）、已完成未评价可弹评价表单。
 * 数据 hook：useCoachingOrders / useReviewCoaching（失败呈现错误态并支持重试）。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCoachingOrders, useReviewCoaching } from '../../hooks/useCoaching';
import type { CoachingOrder } from '../../api/modules/coaching.api';
import { Card, Tag, SectionHeading, SpringButton, EmptyState, Reveal, RevealItem } from '../../components';
import { COLORS } from '../../theme/tokens';
import { usePreBrief, useCoachingSummary } from '../../hooks/useAiPlus';

/** P1-2 咨询前梳理固定引导问题 */
const PRE_BRIEF_QUESTIONS = [
  '你本次咨询最想解决的核心问题是什么？',
  '你目前的职业/岗位现状是怎样的？',
  '你期望通过这次咨询达成什么结果？',
];

/** 订单状态 -> 标签文案与色调 */
const STATUS_META: Record<
  CoachingOrder['status'],
  { label: string; tone: 'neutral' | 'brand' | 'accent' | 'success' }
> = {
  pending: { label: '待支付', tone: 'accent' },
  paid: { label: '待咨询', tone: 'brand' },
  ongoing: { label: '咨询中', tone: 'accent' },
  completed: { label: '已完成', tone: 'success' },
  canceled: { label: '已取消', tone: 'neutral' },
  refunded: { label: '已退款', tone: 'neutral' },
};

function fmtRange(startAt: string, endAt: string): string {
  const s = new Date(startAt);
  const e = new Date(endAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${s.getFullYear()}/${pad(s.getMonth() + 1)}/${pad(s.getDate())} ${pad(s.getHours())}:${pad(s.getMinutes())}-${pad(e.getHours())}:${pad(e.getMinutes())}`;
}

/** 星级选择器 */
function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} 星`}
          className="text-2xl leading-none transition-transform hover:scale-110"
          style={{ color: n <= value ? COLORS.accent : '#d4d4d4' }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/** 评价弹层 */
function ReviewModal({
  order,
  onClose,
}: {
  order: CoachingOrder;
  onClose: () => void;
}) {
  const review = useReviewCoaching();
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    try {
      await review.mutateAsync({ orderId: order.id, body: { rating, content: content.trim() || undefined } });
      onClose();
    } catch (e) {
      setErr((e as { message?: string })?.message ?? '提交失败，请稍后重试。');
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <SectionHeading size="md" title={`评价与 ${order.coachName} 的咨询`} />
        <div className="mt-4">
          <p className="mb-2 text-sm text-neutral-600">你的评分</p>
          <StarInput value={rating} onChange={setRating} />
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          maxLength={300}
          placeholder="说说这次咨询的收获…（选填）"
          className="mt-4 w-full resize-none rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-brand-primary-500 focus:outline-none focus:ring-2 focus:ring-brand-primary-500/20"
        />
        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        <div className="mt-5 flex justify-end gap-3">
          <SpringButton variant="ghost" onClick={onClose}>
            取消
          </SpringButton>
          <SpringButton variant="accent" disabled={review.isPending} onClick={submit}>
            {review.isPending ? '提交中…' : '提交评价'}
          </SpringButton>
        </div>
      </div>
    </div>
  );
}

function OrderCard({
  order,
  onEnter,
  onReview,
}: {
  order: CoachingOrder;
  onEnter: (o: CoachingOrder) => void;
  onReview: (o: CoachingOrder) => void;
}) {
  const meta = STATUS_META[order.status];
  const canEnter =
    (order.status === 'paid' || order.status === 'ongoing' || order.status === 'completed') &&
    !!order.sessionId;
  const canReview = order.status === 'completed' && !order.reviewed;
  const canBrief = order.status === 'paid' || order.status === 'ongoing';
  const canSummary = order.status === 'completed';

  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-neutral-800">{order.coachName}</p>
          <p className="mt-0.5 font-mono text-xs text-neutral-400">{fmtRange(order.startAt, order.endAt)}</p>
        </div>
        <Tag tone={meta.tone}>{meta.label}</Tag>
      </div>

      {order.demand ? (
        <p className="line-clamp-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
          诉求：{order.demand}
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <span className="font-mono text-sm tabular-nums" style={{ color: COLORS.accent }}>
          ¥{order.price}
        </span>
        <div className="flex gap-2">
          {canReview ? (
            <SpringButton variant="ghost" onClick={() => onReview(order)}>
              去评价
            </SpringButton>
          ) : null}
          {canEnter ? (
            <SpringButton variant="accent" onClick={() => onEnter(order)}>
              进入会话
            </SpringButton>
          ) : null}
        </div>
      </div>

      {/* P1-2 咨询前梳理（paid/ongoing 订单可用） */}
      {canBrief ? <PreBriefBlock order={order} /> : null}

      {/* P1-3 咨询后纪要（completed 订单可用） */}
      {canSummary ? <SummaryBlock order={order} /> : null}
    </Card>
  );
}

/**
 * P1-2 咨询前梳理内嵌区块（幂等 POST /ai/coaching/pre-brief）
 * -------------------------------------------------------------
 * 仅对 paid/ongoing 订单展示。填写固定引导问答后生成结构化提纲。
 * - degraded=true 正常展示 outline + amber 轻提示
 * - 错误码 4004/4003/4710/4005 → 展示后端 message + errorCode，不回退 mock
 */
function PreBriefBlock({ order }: { order: CoachingOrder }) {
  const { data, loading, error, errorCode, degraded, run } = usePreBrief();
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<string[]>(() => PRE_BRIEF_QUESTIONS.map(() => ''));

  const canSubmit = answers.some((a) => a.trim().length > 0);

  const submit = () => {
    const payload = PRE_BRIEF_QUESTIONS.map((q, i) => ({ question: q, answer: answers[i].trim() }))
      .filter((a) => a.answer.length > 0);
    if (payload.length === 0) return;
    void run({ orderId: order.id, answers: payload });
  };

  return (
    <div className="mt-1 border-t border-neutral-100 pt-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-brand-primary-600 hover:underline"
        >
          生成咨询提纲（AI）
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-neutral-500">回答以下问题，AI 帮你梳理咨询提纲：</p>
          {PRE_BRIEF_QUESTIONS.map((q, i) => (
            <label key={i} className="block">
              <span className="mb-1 block text-xs text-neutral-600">{q}</span>
              <textarea
                value={answers[i]}
                onChange={(e) =>
                  setAnswers((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                }
                rows={2}
                className="w-full resize-none rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-brand-primary-500 focus:outline-none focus:ring-2 focus:ring-brand-primary-500/20"
              />
            </label>
          ))}
          <div className="flex justify-end gap-2">
            <SpringButton variant="ghost" onClick={() => setOpen(false)}>
              收起
            </SpringButton>
            <SpringButton variant="accent" disabled={loading || !canSubmit} onClick={submit}>
              {loading ? '生成中…' : '生成提纲'}
            </SpringButton>
          </div>
        </div>
      )}

      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
          {errorCode ? <span className="ml-1 font-mono text-xs opacity-70">({errorCode})</span> : null}
        </p>
      ) : null}

      {data && data.outline ? (
        <div className="mt-3 rounded-xl border border-neutral-100 bg-neutral-50/60 p-3">
          {degraded ? (
            <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
              当前为规则版提纲（AI 服务繁忙），内容仍可参考。
            </p>
          ) : null}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">{data.outline}</p>
          {data.tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.tags.map((t) => (
                <Tag key={t} tone="brand" size="sm">{t}</Tag>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SummaryBlock({ order }: { order: CoachingOrder }) {
  const { data, loading, error, errorCode, degraded, run } = useCoachingSummary();
  const [started, setStarted] = useState(false);

  const generate = () => {
    setStarted(true);
    void run({ orderId: order.id });
  };

  return (
    <div className="mt-1 border-t border-neutral-100 pt-3">
      {!started || (!data && !loading && !error) ? (
        <button
          type="button"
          onClick={generate}
          className="text-sm font-medium text-brand-primary-600 hover:underline"
        >
          生成咨询纪要（AI）
        </button>
      ) : null}

      {loading ? <p className="text-sm text-neutral-400">正在整理咨询纪要…</p> : null}

      {error ? (
        <p className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
          {errorCode ? <span className="ml-1 font-mono text-xs opacity-70">({errorCode})</span> : null}
          <button type="button" onClick={generate} className="ml-2 font-medium underline">
            重试
          </button>
        </p>
      ) : null}

      {data && data.summary ? (
        <div className="mt-1 rounded-xl border border-neutral-100 bg-neutral-50/60 p-3">
          {degraded ? (
            <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
              当前为规则版纪要（AI 服务繁忙），内容仍可参考。
            </p>
          ) : null}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">{data.summary}</p>
          {data.todos && data.todos.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {data.todos.map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-neutral-700">
                  <span className="mt-0.5 text-brand-primary-600">{t.done ? '☑' : '☐'}</span>
                  <span className={t.done ? 'line-through text-neutral-400' : ''}>{t.title}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function MyCoachingPage() {
  const navigate = useNavigate();
  const { data: orders = [], isLoading, isError, refetch } = useCoachingOrders();
  const [reviewing, setReviewing] = useState<CoachingOrder | null>(null);

  const enterSession = (o: CoachingOrder) => {
    if (o.sessionId) navigate(`/app/coaching/session/${o.sessionId}`);
  };

  return (
    <section className="mx-auto max-w-2xl">
      <SectionHeading
        size="lg"
        eyebrow="MY COACHING"
        title="我的辅导"
        subtitle="查看你的咨询订单、进入会话，并为已完成的咨询留下评价。"
      />

      {isLoading ? (
        <p className="mt-8 text-sm text-neutral-400">加载订单中…</p>
      ) : isError ? (
        <EmptyState
          className="mt-10"
          icon="compass"
          title="订单加载失败"
          description="可能是网络或服务异常，请稍后重试。"
          action={<SpringButton onClick={() => refetch()}>重新加载</SpringButton>}
        />
      ) : orders.length === 0 ? (
        <EmptyState
          className="mt-10"
          title="还没有咨询订单"
          description="从辅导师列表挑选一位适合你的导师，开启第一次 1v1 咨询。"
          action={
            <SpringButton variant="accent" onClick={() => navigate('/app/coaching/coaches')}>
              去看看辅导师
            </SpringButton>
          }
        />
      ) : (
        <Reveal className="mt-8 flex flex-col gap-4">
          {orders.map((o) => (
            <RevealItem key={o.id}>
              <OrderCard order={o} onEnter={enterSession} onReview={setReviewing} />
            </RevealItem>
          ))}
        </Reveal>
      )}

      {reviewing ? <ReviewModal order={reviewing} onClose={() => setReviewing(null)} /> : null}
    </section>
  );
}

export default MyCoachingPage;