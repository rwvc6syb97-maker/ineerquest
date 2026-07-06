/**
 * P31 支付结果页（/payment/result，T2-11）
 * -------------------------------------------------------------
 * 三态展示：成功 / 失败 / 处理中（默认成功由收银台带入）。
 * 成功 → 提供「查看完整报告」（回跳 redirect 或 /app/report/:reportId）；
 * 失败 → 提供「重新支付」（回订单收银台）与「返回」。
 * query：status(success|fail|pending)、orderId、reportId、redirect。
 */
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, SectionHeading, SpringButton } from '../../components';

type ResultStatus = 'success' | 'fail' | 'pending';

const COPY: Record<ResultStatus, { title: string; desc: string; color: string }> = {
  success: {
    title: '支付成功',
    desc: '完整报告已解锁，现在可以查看你的全部人格洞察。',
    color: '#22c55e',
  },
  fail: {
    title: '支付未完成',
    desc: '订单未支付成功，你可以返回收银台重新尝试。',
    color: '#ef4444',
  },
  pending: {
    title: '支付处理中',
    desc: '支付结果确认中，请稍候或刷新查看最新状态。',
    color: '#f97316',
  },
};

export function PaymentResultPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const status = (params.get('status') as ResultStatus) || 'success';
  const orderId = params.get('orderId') ?? '';
  const reportId = params.get('reportId') ?? '';
  const redirect = params.get('redirect') ?? '';

  const copy = COPY[status] ?? COPY.success;

  const goReport = () => {
    if (redirect) {
      navigate(decodeURIComponent(redirect), { replace: true });
    } else if (reportId) {
      navigate(`/app/report/${reportId}`, { replace: true });
    } else {
      navigate('/app/orders', { replace: true });
    }
  };

  const retry = () => {
    const q = new URLSearchParams({ orderId });
    if (reportId) q.set('reportId', reportId);
    if (redirect) q.set('redirect', redirect);
    navigate(`/checkout?${q.toString()}`, { replace: true });
  };

  return (
    <div className="mx-auto max-w-md px-4 pb-20 pt-16">
      <Card padding="lg" className="flex flex-col items-center text-center">
        {/* 状态图标 */}
        <span
          className="flex h-16 w-16 items-center justify-center rounded-full text-3xl"
          style={{ backgroundColor: `${copy.color}1f`, color: copy.color }}
          aria-hidden
        >
          {status === 'success' ? '✓' : status === 'fail' ? '✕' : '…'}
        </span>

        <div className="mt-5">
          <SectionHeading align="center" size="md" title={copy.title} subtitle={copy.desc} />
        </div>

        <div className="mt-8 flex w-full flex-col gap-3">
          {status === 'success' ? (
            <SpringButton variant="accent" className="w-full" onClick={goReport}>
              查看完整报告
            </SpringButton>
          ) : null}

          {status === 'fail' ? (
            <>
              <SpringButton variant="accent" className="w-full" onClick={retry}>
                重新支付
              </SpringButton>
              <SpringButton
                variant="ghost"
                className="w-full"
                onClick={() => navigate('/pricing', { replace: true })}
              >
                重新选择套餐
              </SpringButton>
            </>
          ) : null}

          {status === 'pending' ? (
            <SpringButton
              variant="accent"
              className="w-full"
              onClick={() => navigate(0)}
            >
              刷新状态
            </SpringButton>
          ) : null}

          <SpringButton
            variant="ghost"
            className="w-full"
            onClick={() => navigate('/app/orders')}
          >
            查看我的订单
          </SpringButton>
        </div>
      </Card>
    </div>
  );
}

export default PaymentResultPage;