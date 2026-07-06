import { PaymentService } from './payment.service';
import { WechatPayAdapter } from './pay-channel.adapter';
import { BizType, OrderStatus, PayChannel } from './payment.constants';

/**
 * PaymentService 单测：纯确定性，Prisma/Redis/Analytics 全部以内存 mock 替身，
 * 无任何网络/DB 依赖。覆盖多态下单、超时关单、回调幂等与签名校验、退款状态机。
 */
describe('PaymentService', () => {
  // ---- 内存 mock 工厂 ----
  const makeRedis = () => ({ raw: { zadd: jest.fn(), zremrangebyscore: jest.fn() } });
  const makeAnalytics = () => ({ fire: jest.fn() });
  const makeCoaching = () => ({ confirmAfterPaid: jest.fn().mockResolvedValue({ ok: true }) });

  const build = (prismaOverrides: Record<string, unknown> = {}) => {
    const redis = makeRedis();
    const analytics = makeAnalytics();
    const coaching = makeCoaching();
    const prisma: any = {
      paymentOrder: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      paymentTransaction: { findUnique: jest.fn(), create: jest.fn() },
      paymentRefund: { create: jest.fn(), update: jest.fn() },
      report: { findFirst: jest.fn(), updateMany: jest.fn() },
      membershipPlan: { findFirst: jest.fn() },
      coachingOrder: { findFirst: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
      ...prismaOverrides,
    };
    const wechat = new WechatPayAdapter();
    const svc = new PaymentService(prisma as any, redis as any, analytics as any, wechat, coaching as any);
    return { svc, prisma, redis, analytics, wechat, coaching };
  };

  process.env.NODE_ENV = 'test'; // 关闭定时器

  describe('T2-01 多态创建订单', () => {
    it('报告解锁：校验归属并落库定价 990 分', async () => {
      const { svc, prisma } = build();
      prisma.report.findFirst.mockResolvedValue({ id: 5n, mbtiType: 'INTJ' });
      prisma.paymentOrder.create.mockResolvedValue({
        id: 1n, payNo: 'PAY1', bizType: 1, bizId: 5n, subject: 's',
        amount: 990n, status: 1, channel: null, expireAt: new Date(), paidAt: null,
      });
      const vo = await svc.createOrder('7', BizType.REPORT_UNLOCK, '5');
      expect(prisma.paymentOrder.create).toHaveBeenCalled();
      expect(vo.amount).toBe(990);
      expect(vo.statusLabel).toBe('pending');
    });

    it('会员下架 → 70004', async () => {
      const { svc, prisma } = build();
      prisma.membershipPlan.findFirst.mockResolvedValue({ id: 2n, name: 'vip', price: 5000n, status: 0 });
      await expect(svc.createOrder('7', BizType.MEMBERSHIP, '2')).rejects.toMatchObject({
        bizCode: 70004,
      });
    });

    it('报告不存在 → 70005', async () => {
      const { svc, prisma } = build();
      prisma.report.findFirst.mockResolvedValue(null);
      await expect(svc.createOrder('7', BizType.REPORT_UNLOCK, '9')).rejects.toMatchObject({
        bizCode: 70005,
      });
    });
  });

  describe('T2-02 超时关单', () => {
    it('sweepExpiredOrders 关闭过期 PENDING 订单', async () => {
      const { svc, prisma } = build();
      prisma.paymentOrder.findMany.mockResolvedValue([{ id: 1n }, { id: 2n }]);
      prisma.paymentOrder.updateMany.mockResolvedValue({ count: 1 });
      const closed = await svc.sweepExpiredOrders(new Date());
      expect(closed).toBe(2);
      expect(prisma.paymentOrder.updateMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('T2-04 支付回调幂等与签名', () => {
    const validBody = (wechat: WechatPayAdapter, amount = 990) => {
      const body = { payNo: 'PAY1', channelTradeNo: 'TX1', amount };
      const sign = wechat.sign(body);
      return { ...body, sign };
    };

    it('签名非法 → 70007', async () => {
      const { svc } = build();
      await expect(
        svc.handleCallback('wechat', { payNo: 'PAY1', channelTradeNo: 'TX1', amount: 990, sign: 'bad' }),
      ).rejects.toMatchObject({ bizCode: 70007 });
    });

    it('首次回调成功：置 PAID 并解锁报告', async () => {
      const { svc, prisma, wechat } = build();
      prisma.paymentOrder.findFirst.mockResolvedValue({
        id: 1n, payNo: 'PAY1', amount: 990n, userId: 7n, bizType: BizType.REPORT_UNLOCK, bizId: 5n,
      });
      prisma.paymentTransaction.findUnique.mockResolvedValue(null);
      prisma.paymentTransaction.create.mockResolvedValue({});
      prisma.paymentOrder.updateMany.mockResolvedValue({ count: 1 });
      prisma.report.updateMany.mockResolvedValue({ count: 1 });

      const r = await svc.handleCallback('wechat', validBody(wechat));
      expect(r).toEqual({ ok: true, duplicated: false });
      expect(prisma.report.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isUnlocked: 1 }) }),
      );
    });

    it('重复回调命中唯一键 → 幂等成功不重复解锁', async () => {
      const { svc, prisma, wechat } = build();
      prisma.paymentOrder.findFirst.mockResolvedValue({
        id: 1n, payNo: 'PAY1', amount: 990n, userId: 7n, bizType: BizType.REPORT_UNLOCK, bizId: 5n,
      });
      prisma.paymentTransaction.findUnique.mockResolvedValue({ id: 99n }); // 已存在
      const r = await svc.handleCallback('wechat', validBody(wechat));
      expect(r).toEqual({ ok: true, duplicated: true });
      expect(prisma.report.updateMany).not.toHaveBeenCalled();
    });

    it('咨询订单回调成功：置 PAID 并调用 confirmAfterPaid 确认时段（LOCKED→BOOKED）', async () => {
      const { svc, prisma, coaching, wechat } = build();
      prisma.paymentOrder.findFirst.mockResolvedValue({
        id: 1n, payNo: 'PAY1', amount: 990n, userId: 7n, bizType: BizType.COACHING, bizId: 500n,
      });
      prisma.paymentTransaction.findUnique.mockResolvedValue(null);
      prisma.paymentTransaction.create.mockResolvedValue({});
      prisma.paymentOrder.updateMany.mockResolvedValue({ count: 1 });

      const r = await svc.handleCallback('wechat', validBody(wechat));
      expect(r).toEqual({ ok: true, duplicated: false });
      expect(coaching.confirmAfterPaid).toHaveBeenCalledWith('500', '1');
      expect(prisma.report.updateMany).not.toHaveBeenCalled();
    });

    it('金额不符 → 70003', async () => {
      const { svc, prisma, wechat } = build();
      prisma.paymentOrder.findFirst.mockResolvedValue({
        id: 1n, payNo: 'PAY1', amount: 1000n, userId: 7n, bizType: 1, bizId: 5n,
      });
      await expect(svc.handleCallback('wechat', validBody(wechat, 990))).rejects.toMatchObject({
        bizCode: 70003,
      });
    });
  });

  describe('T2-07 退款', () => {
    it('全额退款：置 REFUNDED', async () => {
      const { svc, prisma } = build();
      prisma.paymentOrder.findFirst.mockResolvedValue({
        id: 1n, payNo: 'PAY1', amount: 990n, refundedAmount: 0n, userId: 7n,
        status: OrderStatus.PAID, channel: PayChannel.WECHAT, isDeleted: 0,
      });
      prisma.paymentRefund.create.mockResolvedValue({ id: 10n });
      prisma.paymentTransaction.create.mockResolvedValue({});
      prisma.paymentRefund.update.mockResolvedValue({});
      prisma.paymentOrder.update.mockResolvedValue({});
      const r = await svc.refund('7', '1');
      expect(r.amount).toBe(990);
      expect(prisma.paymentOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: OrderStatus.REFUNDED }) }),
      );
    });

    it('超额退款 → 70006', async () => {
      const { svc, prisma } = build();
      prisma.paymentOrder.findFirst.mockResolvedValue({
        id: 1n, payNo: 'PAY1', amount: 990n, refundedAmount: 900n, userId: 7n,
        status: OrderStatus.PARTIAL_REFUNDED, channel: PayChannel.WECHAT, isDeleted: 0,
      });
      await expect(svc.refund('7', '1', 200)).rejects.toMatchObject({ bizCode: 70006 });
    });

    it('未支付订单退款 → 70006', async () => {
      const { svc, prisma } = build();
      prisma.paymentOrder.findFirst.mockResolvedValue({
        id: 1n, payNo: 'PAY1', amount: 990n, refundedAmount: 0n, userId: 7n,
        status: OrderStatus.PENDING, channel: null, isDeleted: 0,
      });
      await expect(svc.refund('7', '1')).rejects.toMatchObject({ bizCode: 70006 });
    });
  });

  describe('WechatPayAdapter mock', () => {
    it('prepay 返回 mock 标记与可复算签名', async () => {
      const wechat = new WechatPayAdapter();
      const r = await wechat.prepay({ payNo: 'PAY1', amount: 990, subject: 's' });
      expect(r.mock).toBe(true);
      expect(r.prepayId).toContain('PAY1');
    });

    it('verifySign 对合法签名返回 true', () => {
      const wechat = new WechatPayAdapter();
      const body = { payNo: 'PAY1', channelTradeNo: 'TX1', amount: 990 };
      expect(wechat.verifySign(body, wechat.sign(body))).toBe(true);
      expect(wechat.verifySign(body, 'bad')).toBe(false);
    });
  });
});