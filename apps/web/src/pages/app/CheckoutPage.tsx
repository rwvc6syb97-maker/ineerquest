/**
 * 收银台页（/checkout，T2-08）
 * -------------------------------------------------------------
 * 展示订单主体/金额 + 15 分钟关单倒计时 + 支付渠道选择 → 发起支付。
 * 支付成功（含 mock）后：报告解锁场景调用 useUnlockReport 放开付费段，
 * 再跳转支付结果页 /payment/result。
 * query：orderId（必填）、reportId（解锁场景）、redirect（结果页回跳目标）。
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useOrder, usePayOrder, useUnlockReport, markOrderPaid } from '../../hooks/usePayment';
import { PayChannel } from '../../api/modules/payment.api';
import { Card, SectionHeading, SpringButton, EmptyState, BackButton } from '../../components';

/** 分 → 元 */
function yuan(fen: number): string {
  return (fen / 100).toFixed(2);
}

/** 毫秒差 → mm:ss */
function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

const CHANNELS = [
  { value: PayChannel.WECHAT, label: '微信支付' },
  { value: PayChannel.ALIPAY, label: '支付宝' },
] as const;

export function CheckoutPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const orderId = params.get('orderId') ?? '';
  const reportId = params.get('reportId') ?? '';
  const redirect = params.get('redirect') ?? '';

  const { data: order, isLoading } = useOrder(orderId);
  const payOrder = usePayOrder();
  const unlock = useUnlockReport();

  const [channel, setChannel] = useState<number>(PayChannel.WECHAT);
  const [now, setNow] = useState<number>(Date.now());
  const [errorMsg, setErrorMsg] = useState<string>('');

  // 关单倒计时（每秒刷新）
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remainMs = useMemo(() => {
    if (!order?.expireAt) return 0;
    return new Date(order.expireAt).getTime() - now;
  }, [order?.expireAt, now]);

  const expired = !!order?.expireAt && remainMs <= 0;

  const gotoResult = (status: 'success' | 'fail') => {
    const q = new URLSearchParams({ orderId, status });
    if (reportId) q.set('reportId', reportId);
    if (redirect) q.set('redirect', redirect);
    navigate(`/payment/result?${q.toString()}`, { replace: true });
  };

  const handlePay = () => {
    if (!orderId || expired) return;
    setErrorMsg('');
    payOrder.mutate(
      { orderId, channel },
      {
        onSuccess: async () => {
          markOrderPaid(orderId); // 本地缓存标记已支付
          if (reportId) {
            try {
              await unlock.mutateAsync(reportId); // 放开付费段
            } catch (err) {
              // 解锁失败：呈现错误并跳失败页，禁止静默放行
              const msg = (err as { message?: string })?.message ?? '解锁失败，请稍后重试';
              setErrorMsg(msg);
              gotoResult('fail');
              return;
            }
          }
          gotoResult('success');
        },
        onError: (err) => {
          const msg =
            (err as { message?: string })?.message ?? '支付失败，请重试';
          setErrorMsg(msg);
          gotoResult('fail');
        },
      },
    );
  };

  if (isLoading) {
    return <p className="py-16 text-center font-serif text-neutral-400">订单加载中…</p>;
  }
  if (!orderId || !order) {
    return (
      <div className="py-16">
        <EmptyState
          icon="sparkle"
          title="订单不存在或已失效"
          description="请返回重新选择套餐后再试。"
          action={
            <SpringButton variant="accent" onClick={() => navigate('/pricing')}>
              重新选择套餐
            </SpringButton>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-20 pt-10">
      {/* 返回上一级：走浏览器历史（来源可能是报告/定价页） */}
      <BackButton label="返回" className="mb-4" />
      <SectionHeading align="center" eyebrow="CHECKOUT" title="确认支付" />

      <Card padding="lg" className="mt-8">
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">订单主体</span>
          <span className="font-medium text-brand-primary-950">{order.subject}</span>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-neutral-500">应付金额</span>
          <span className="font-display text-3xl font-black text-brand-accent-600">
            ¥{yuan(order.amount)}
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3">
          <span className="text-sm text-neutral-500">支付剩余时间</span>
          <span
            className={
              'font-mono text-lg font-semibold tabular-nums ' +
              (expired ? 'text-neutral-400' : 'text-brand-accent-600')
            }
          >
            {expired ? '已关闭' : fmtCountdown(remainMs)}
          </span>
        </div>

        {/* 支付渠道 */}
        <div className="mt-6 space-y-3">
          <p className="text-sm font-medium text-neutral-700">选择支付方式</p>
          {CHANNELS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setChannel(c.value)}
              className={
                'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ' +
                (channel === c.value
                  ? 'border-brand-accent-500 bg-brand-accent-50'
                  : 'border-neutral-200 hover:border-neutral-300')
              }
            >
              <span className="font-medium text-brand-primary-950">{c.label}</span>
              <span
                className={
                  'h-4 w-4 rounded-full border-2 ' +
                  (channel === c.value
                    ? 'border-brand-accent-500 bg-brand-accent-500'
                    : 'border-neutral-300')
                }
              />
            </button>
          ))}
        </div>

        {errorMsg ? (
          <p className="mt-4 text-sm text-red-500">{errorMsg}</p>
        ) : null}

        <SpringButton
          variant="accent"
          className="mt-6 w-full"
          disabled={expired || payOrder.isPending || unlock.isPending}
          onClick={handlePay}
        >
          {payOrder.isPending || unlock.isPending
            ? '支付处理中…'
            : expired
              ? '订单已关闭'
              : `确认支付 ¥${yuan(order.amount)}`}
        </SpringButton>
      </Card>
    </div>
  );
}

export default CheckoutPage;