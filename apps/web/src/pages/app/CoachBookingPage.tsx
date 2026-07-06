/**
 * P21 预约与支付（/app/coaching/booking/:coachId）
 * -------------------------------------------------------------
 * 选时段 + 填诉求 → 预约下单（bizType=2）→ 跳转收银台 /checkout。
 * 错误码：
 *   60001 时段已占用 -> 刷新排期并提示，禁用该时段
 *   60002 停止接单   -> 提示并禁用提交
 * 数据 hook：useCoachDetail / useCoachSchedule / useBookCoaching（mock 兜底）。
 */
import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useCoachDetail,
  useCoachSchedule,
  useBookCoaching,
  COACHING_ERROR,
} from '../../hooks/useCoaching';
import { Card, SectionHeading, SpringButton, BackButton } from '../../components';
import { COLORS } from '../../theme/tokens';

/** ISO -> "MM/DD HH:mm" */
function fmtSlot(startAt: string, endAt: string): string {
  const s = new Date(startAt);
  const e = new Date(endAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(s.getMonth() + 1)}/${pad(s.getDate())} ${pad(s.getHours())}:${pad(s.getMinutes())}-${pad(e.getHours())}:${pad(e.getMinutes())}`;
}

export function CoachBookingPage() {
  const { coachId = '' } = useParams();
  const navigate = useNavigate();
  const { data: coach } = useCoachDetail(coachId);
  const { data: slots = [], isLoading, refetch } = useCoachSchedule(coachId);
  const book = useBookCoaching();

  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [demand, setDemand] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const closed = coach?.closed ?? false;

  // 按日期分组
  const grouped = useMemo(() => {
    const map = new Map<string, typeof slots>();
    for (const s of slots) {
      const day = new Date(s.startAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(s);
    }
    return [...map.entries()];
  }, [slots]);

  const canSubmit = !!selectedSlot && !closed && !book.isPending;

  const handleBook = async () => {
    if (!canSubmit) return;
    setErrorMsg('');
    try {
      const result = await book.mutateAsync({ coachId, slotId: selectedSlot, demand: demand.trim() || undefined });
      // 跳转收银台，支付完成回跳「我的辅导」
      const q = new URLSearchParams({
        orderId: result.orderId,
        redirect: '/app/coaching/orders',
      });
      navigate(`/checkout?${q.toString()}`);
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code === COACHING_ERROR.SLOT_TAKEN) {
        setErrorMsg('该时段刚被占用，请重新选择。');
        setSelectedSlot('');
        void refetch();
      } else if (code === COACHING_ERROR.COACH_CLOSED) {
        setErrorMsg('辅导师已停止接单。');
      } else {
        setErrorMsg((err as { message?: string })?.message ?? '预约失败，请稍后重试。');
      }
    }
  };

  return (
    <section className="mx-auto max-w-2xl pb-28">
      {/* 返回上一级：辅导师详情 */}
      <BackButton to={`/app/coaching/coaches/${coachId}`} label="返回辅导师详情" className="mb-4" />
      <SectionHeading
        size="lg"
        eyebrow="BOOKING"
        title="预约咨询时段"
        subtitle={coach ? `与 ${coach.name} 的 1v1 咨询，请选择合适的时间。` : '选择一个合适的时间。'}
      />

      {closed ? (
        <Card padding="md" className="mt-6 border-l-4" style={{ borderLeftColor: COLORS.accent }}>
          <p className="text-sm text-neutral-600">该辅导师暂停接单，暂时无法预约。</p>
        </Card>
      ) : null}

      {/* 时段选择 */}
      <div className="mt-8">
        <SectionHeading size="md" title="选择时段" />
        {isLoading ? (
          <p className="mt-4 text-sm text-neutral-400">加载可约时段…</p>
        ) : grouped.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-400">近期暂无可约时段。</p>
        ) : (
          <div className="mt-4 flex flex-col gap-5">
            {grouped.map(([day, daySlots]) => (
              <div key={day}>
                <p className="mb-2 text-sm font-medium text-neutral-600">{day}</p>
                <div className="flex flex-wrap gap-2">
                  {daySlots.map((s) => {
                    const active = s.slotId === selectedSlot;
                    const disabled = !s.available || closed;
                    return (
                      <button
                        key={s.slotId}
                        type="button"
                        disabled={disabled}
                        onClick={() => setSelectedSlot(s.slotId)}
                        aria-pressed={active}
                        className={`rounded-lg border px-3 py-2 font-mono text-xs transition-colors ${
                          disabled
                            ? 'cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-300 line-through'
                            : active
                              ? 'border-transparent text-white shadow-sm'
                              : 'border-neutral-300 text-neutral-700 hover:border-brand-primary-400'
                        }`}
                        style={active && !disabled ? { backgroundColor: COLORS.accent } : undefined}
                      >
                        {fmtSlot(s.startAt, s.endAt)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 诉求填写 */}
      <div className="mt-8">
        <SectionHeading size="md" title="咨询诉求（选填）" />
        <textarea
          value={demand}
          onChange={(e) => setDemand(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="简单描述你想解决的问题，帮助辅导师提前准备…"
          className="mt-3 w-full resize-none rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-brand-primary-500 focus:outline-none focus:ring-2 focus:ring-brand-primary-500/20"
        />
        <p className="mt-1 text-right font-mono text-xs text-neutral-400">{demand.length}/500</p>
      </div>

      {errorMsg ? (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{errorMsg}</p>
      ) : null}

      {/* 底部固定确认栏 */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3">
          <div>
            {coach ? (
              <>
                <span className="font-mono text-lg font-semibold tabular-nums" style={{ color: COLORS.accent }}>
                  ¥{coach.price}
                </span>
                <span className="ml-1 text-xs text-neutral-400">/ 次咨询</span>
              </>
            ) : null}
          </div>
          <SpringButton variant="accent" disabled={!canSubmit} onClick={handleBook}>
            {book.isPending ? '提交中…' : '确认预约并支付'}
          </SpringButton>
        </div>
      </div>
    </section>
  );
}

export default CoachBookingPage;