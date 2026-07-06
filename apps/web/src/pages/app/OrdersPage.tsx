/**
 * 订单列表页（/app/orders，T2-09）
 * -------------------------------------------------------------
 * 本地缓存驱动 + 10s 轮询：展示订单主体/金额/状态，待支付项显示关单倒计时并可继续支付。
 * TODO(blocked)：后端提供 GET /payments/orders 后切换为服务端数据源（见 阶段2 待办清单）。
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrders } from '../../hooks/usePayment';
import { OrderStatus } from '../../api/modules/payment.api';
import type { PaymentOrder } from '../../api/modules/payment.api';
import { Card, SectionHeading, StatPill, SpringButton, EmptyState } from '../../components';

function yuan(fen: number): string {
  return (fen / 100).toFixed(2);
}

function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

const STATUS_META: Record<number, { label: string; tone: 'brand' | 'accent' | 'neutral' }> = {
  [OrderStatus.PENDING]: { label: '待支付', tone: 'accent' },
  [OrderStatus.PAID]: { label: '已支付', tone: 'brand' },
  [OrderStatus.CLOSED]: { label: '已关闭', tone: 'neutral' },
  [OrderStatus.REFUNDED]: { label: '已退款', tone: 'neutral' },
  [OrderStatus.PARTIAL_REFUNDED]: { label: '部分退款', tone: 'neutral' },
};

export function OrdersPage() {
  const navigate = useNavigate();
  const { data: orders = [], isLoading } = useOrders();
  const [now, setNow] = useState<number>(Date.now());

  // 倒计时刷新
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const continuePay = (o: PaymentOrder) => {
    const q = new URLSearchParams({ orderId: o.id });
    // 报告解锁订单 bizType=1，携带 reportId 便于支付后解锁
    if (o.bizType === 1) q.set('reportId', o.bizId);
    navigate(`/checkout?${q.toString()}`);
  };

  if (isLoading) {
    return <p className="py-16 text-center font-serif text-neutral-400">订单加载中…</p>;
  }

  if (orders.length === 0) {
    return (
      <div className="py-16">
        <EmptyState
          icon="sparkle"
          title="还没有订单"
          description="选择一个套餐，开启你的完整人格与职业洞察之旅。"
          action={
            <SpringButton variant="accent" onClick={() => navigate('/pricing')}>
              去选套餐
            </SpringButton>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-10">
      <SectionHeading eyebrow="ORDERS" title="我的订单" />

      <div className="mt-8 space-y-4">
        {orders.map((o) => {
          const meta = STATUS_META[o.status] ?? { label: o.statusLabel, tone: 'neutral' as const };
          const isPending = o.status === OrderStatus.PENDING;
          const remainMs = o.expireAt ? new Date(o.expireAt).getTime() - now : 0;
          const expired = isPending && !!o.expireAt && remainMs <= 0;
          return (
            <Card key={o.id} padding="lg">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-lg font-bold text-brand-primary-950">
                    {o.subject}
                  </h3>
                  <p className="mt-1 font-mono text-xs text-neutral-400">单号 {o.payNo}</p>
                </div>
                <StatPill label="" value={expired ? '已关闭' : meta.label} tone={meta.tone} />
              </div>

              <div className="mt-4 flex items-end justify-between">
                <div>
                  <span className="font-display text-2xl font-black text-brand-accent-600">
                    ¥{yuan(o.amount)}
                  </span>
                  {isPending && !expired ? (
                    <p className="mt-1 text-sm text-neutral-500">
                      关单倒计时{' '}
                      <span className="font-mono font-semibold text-brand-accent-600">
                        {fmtCountdown(remainMs)}
                      </span>
                    </p>
                  ) : null}
                  {o.paidAt ? (
                    <p className="mt-1 text-xs text-neutral-400">
                      支付于 {new Date(o.paidAt).toLocaleString()}
                    </p>
                  ) : null}
                </div>

                {isPending && !expired ? (
                  <SpringButton variant="accent" onClick={() => continuePay(o)}>
                    继续支付
                  </SpringButton>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default OrdersPage;