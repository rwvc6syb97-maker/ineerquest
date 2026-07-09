/**
 * P30 套餐选择页（/pricing，游客可访问）
 * -------------------------------------------------------------
 * 展示上架套餐卡片（推荐高亮）→ 选择套餐后创建订单并跳转收银台 /checkout。
 * 底部提供激活码兑换入口（需登录）。
 */
import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { usePlans } from '../../hooks/useMembership';
import { useCreateOrder } from '../../hooks/usePayment';
import { useAuthStore } from '../../stores/auth.store';
import { membershipApi, ApiError } from '../../api';
import { BizType } from '../../api/modules/payment.api';
import type { MembershipPlan } from '../../api/modules/membership.api';
import {
  Card,
  SectionHeading,
  StatPill,
  SpringButton,
  EmptyState,
  Reveal,
  RevealItem,
} from '../../components';

/** 分 → 元展示 */
function yuan(fen: number): string {
  return (fen / 100).toFixed(fen % 100 === 0 ? 0 : 2);
}

/** benefits 归一化为字符串数组 */
function toBenefits(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x));
  return [];
}

export function PricingPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const reportId = params.get('reportId') ?? '';
  const redirect = params.get('redirect') ?? '';

  const { data: plans = [], isLoading, isError } = usePlans();
  const createOrder = useCreateOrder();
  const isLoggedIn = useAuthStore((s) => !!s.user);

  // 激活码兑换
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSelect = (plan: MembershipPlan) => {
    // 报告解锁场景 bizType=1 且 bizId=reportId；否则会员 bizType=3 且 bizId=plan.planId
    const isUnlock = !!reportId;
    createOrder.mutate(
      {
        bizType: isUnlock ? BizType.REPORT_UNLOCK : BizType.MEMBERSHIP,
        bizId: isUnlock ? reportId : String(plan.planId),
      },
      {
        onSuccess: (order) => {
          const q = new URLSearchParams({ orderId: order.id });
          if (reportId) q.set('reportId', reportId);
          if (redirect) q.set('redirect', redirect);
          navigate(`/checkout?${q.toString()}`);
        },
      },
    );
  };

  if (isLoading) {
    return <p className="py-16 text-center font-serif text-neutral-400">套餐加载中…</p>;
  }
  if (isError && plans.length === 0) {
    return (
      <div className="py-16">
        <EmptyState
          icon="sparkle"
          title="暂无可选套餐"
          description="套餐信息加载失败，请稍后重试。"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-10">
      <SectionHeading
        align="center"
        eyebrow="PRICING"
        title={reportId ? '解锁你的完整报告' : '选择适合你的套餐'}
        subtitle="一次投入，把人格洞察真正转化为职业与关系的现实决策。"
      />

      <Reveal
        className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2"
        deps={[plans.length]}
      >
        {plans.map((plan, i) => {
          const benefits = toBenefits(plan.benefits);
          const recommended = plan.isRecommended === 1;
          return (
            <RevealItem key={plan.planId} index={i}>
              <Card
                padding="lg"
                className={
                  'relative flex h-full flex-col ' +
                  (recommended ? 'ring-2 ring-brand-accent-500' : '')
                }
              >
                {recommended ? (
                  <span className="absolute right-5 top-5">
                    <StatPill label="" value="推荐" color="#f97316" />
                  </span>
                ) : null}
                <h3 className="font-display text-2xl font-bold text-brand-primary-950">
                  {plan.name}
                </h3>
                {plan.subtitle ? (
                  <p className="mt-2 text-sm text-neutral-500">{plan.subtitle}</p>
                ) : null}

                <div className="mt-5 flex items-end gap-2">
                  <span className="font-display text-4xl font-black text-brand-primary-950">
                    ¥{yuan(plan.price ?? 0)}
                  </span>
                  {plan.originalPrice && plan.originalPrice > (plan.price ?? 0) ? (
                    <span className="mb-1 text-sm text-neutral-400 line-through">
                      ¥{yuan(plan.originalPrice)}
                    </span>
                  ) : null}
                  {plan.durationDays ? (
                    <span className="mb-1 text-sm text-neutral-500">
                      / {plan.durationDays} 天
                    </span>
                  ) : null}
                </div>

                <ul className="mt-5 flex-1 space-y-2.5">
                  {benefits.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm text-neutral-700">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-accent-500" />
                      {b}
                    </li>
                  ))}
                </ul>

                <SpringButton
                  variant={recommended ? 'accent' : 'ghost'}
                  className="mt-6 w-full"
                  disabled={createOrder.isPending}
                  onClick={() => handleSelect(plan)}
                >
                  {createOrder.isPending ? '创建订单中…' : '立即购买'}
                </SpringButton>
              </Card>
            </RevealItem>
          );
        })}
      </Reveal>

      {/* 激活码兑换入口 */}
      {isLoggedIn && (
        <div className="mt-16 mx-auto max-w-md">
          <div
            className="border-t px-4 pt-10"
            style={{ borderColor: 'var(--color-neutral-200)' }}
          >
            <h3
              className="text-center font-serif text-lg italic tracking-wide"
              style={{ color: 'var(--color-neutral-500)' }}
            >
              已有激活码？
            </h3>
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                placeholder="输入 16 位激活码"
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                className="flex-1 rounded-lg border px-3 py-2.5 text-sm uppercase tracking-wider outline-none transition-shadow focus:ring-2 focus:ring-offset-1"
                style={{
                  borderColor: 'var(--color-neutral-300)',
                  backgroundColor: 'var(--color-neutral-50)',
                  color: 'var(--color-neutral-900)',
                  boxShadow: redeemCode ? 'var(--shadow-sm)' : 'none',
                }}
                maxLength={20}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--brand-primary-400)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-neutral-300)';
                }}
              />
              <SpringButton
                variant="accent"
                disabled={redeeming || redeemCode.length < 4}
                onClick={async () => {
                  setRedeeming(true);
                  setRedeemMsg(null);
                  try {
                    const result = await membershipApi.redeemCode(redeemCode);
                    setRedeemMsg({
                      ok: true,
                      text: result?.message || '兑换成功，会员权益已生效',
                    });
                    setRedeemCode('');
                  } catch (err) {
                    const msg = err instanceof ApiError ? err.message : '兑换失败';
                    setRedeemMsg({ ok: false, text: msg });
                  } finally {
                    setRedeeming(false);
                  }
                }}
              >
                {redeeming ? '兑换中…' : '兑换'}
              </SpringButton>
            </div>
            {redeemMsg && (
              <p
                className="mt-3 text-center text-sm font-medium"
                style={{
                  color: redeemMsg.ok ? 'var(--color-success-600)' : 'var(--color-error-500)',
                }}
              >
                {redeemMsg.text}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PricingPage;