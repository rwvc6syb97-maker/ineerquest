import { CoachingService } from './coaching.service';
import { CoachAuditStatus, CoachingOrderStatus, CoachStatus, ScheduleStatus } from './coaching.constants';

/**
 * CoachingService 单测：纯确定性，Prisma/Redis/Analytics 全部内存 mock 替身，
 * 无网络/DB 依赖。覆盖时段锁冲突(60001)、停止接单(60002)、confirmAfterPaid 确认/释放、评价聚合。
 */
describe('CoachingService', () => {
  // Redis mock：默认锁抢占成功（返回 'OK'）；可覆写模拟已被占。
  const makeRedis = (setResult: string | null = 'OK') => ({
    raw: { set: jest.fn().mockResolvedValue(setResult), del: jest.fn() },
  });
  const makeAnalytics = () => ({ fire: jest.fn() });

  const build = (opts: { setResult?: string | null; prisma?: Record<string, unknown> } = {}) => {
    const redis = makeRedis('setResult' in opts ? (opts.setResult as string | null) : 'OK');
    const analytics = makeAnalytics();
    const prisma: any = {
      coach: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
      coachSchedule: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      coachingOrder: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      coachingReview: { findUnique: jest.fn(), create: jest.fn(), aggregate: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
      ...(opts.prisma ?? {}),
    };
    const svc = new CoachingService(prisma as any, redis as any, analytics as any);
    return { svc, prisma, redis, analytics };
  };

  const onlineCoach = {
    id: 1n,
    realName: '张教练',
    avatar: null,
    title: '资深生涯规划师',
    intro: null,
    expertise: ['转行', '面试'],
    pricePerHour: 20000n,
    rating: '4.90',
    orderCount: 12,
    auditStatus: CoachAuditStatus.APPROVED,
    status: CoachStatus.ONLINE,
    isDeleted: 0,
  };

  process.env.NODE_ENV = 'test'; // 关闭定时器

  describe('T4-01 辅导师列表/详情/排期', () => {
    it('列表仅返回已审核通过且上架的辅导师', async () => {
      const { svc, prisma } = build();
      prisma.coach.count.mockResolvedValue(1);
      prisma.coach.findMany.mockResolvedValue([onlineCoach]);
      const r = await svc.listCoaches({ page: 1, pageSize: 10 });
      expect(prisma.coach.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            auditStatus: CoachAuditStatus.APPROVED,
            status: CoachStatus.ONLINE,
            isDeleted: 0,
          }),
        }),
      );
      expect(r.total).toBe(1);
      expect(r.list[0].rating).toBe(4.9);
    });

    it('详情：未上架/未审核的辅导师 → 60002', async () => {
      const { svc, prisma } = build();
      prisma.coach.findFirst.mockResolvedValue({ ...onlineCoach, status: CoachStatus.OFFLINE });
      await expect(svc.getCoach('1')).rejects.toMatchObject({ bizCode: 60002 });
    });
  });

  describe('T4-02 辅导预约下单（时段锁 + uk_coach_slot）', () => {
    it('时段锁抢占失败 → 60001', async () => {
      const { svc, prisma } = build({ setResult: null }); // SET NX 返回 null 表示已被占
      prisma.coach.findFirst.mockResolvedValue(onlineCoach);
      await expect(
        svc.bookCoaching('7', { coachId: '1', scheduleId: '100' }),
      ).rejects.toMatchObject({ bizCode: 60001 });
    });

    it('辅导师已停止接单 → 60002', async () => {
      const { svc, prisma } = build();
      prisma.coach.findFirst.mockResolvedValue({ ...onlineCoach, status: CoachStatus.OFFLINE });
      await expect(
        svc.bookCoaching('7', { coachId: '1', scheduleId: '100' }),
      ).rejects.toMatchObject({ bizCode: 60002 });
    });

    it('时段已 BOOKED（不可复用）→ 60001', async () => {
      const { svc, prisma } = build();
      prisma.coach.findFirst.mockResolvedValue(onlineCoach);
      prisma.coachSchedule.findFirst.mockResolvedValue({
        id: 100n,
        coachId: 1n,
        status: ScheduleStatus.BOOKED,
        lockExpireAt: null,
      });
      await expect(
        svc.bookCoaching('7', { coachId: '1', scheduleId: '100' }),
      ).rejects.toMatchObject({ bizCode: 60001 });
    });

    it('下单成功：FREE 时段 CAS→LOCKED 并创建 PENDING 订单', async () => {
      const { svc, prisma } = build();
      prisma.coach.findFirst.mockResolvedValue(onlineCoach);
      prisma.coachSchedule.findFirst.mockResolvedValue({
        id: 100n,
        coachId: 1n,
        status: ScheduleStatus.FREE,
        lockExpireAt: null,
      });
      prisma.coachSchedule.updateMany.mockResolvedValue({ count: 1 });
      prisma.coachSchedule.update.mockResolvedValue({});
      prisma.coachingOrder.create.mockResolvedValue({
        id: 500n,
        orderNo: 'CO1',
        coachId: 1n,
        scheduleId: 100n,
        amount: 20000n,
        status: CoachingOrderStatus.PENDING,
        payExpireAt: new Date(),
      });
      const vo = await svc.bookCoaching('7', { coachId: '1', scheduleId: '100' });
      expect(vo.status).toBe(CoachingOrderStatus.PENDING);
      expect(vo.bizType).toBe(2);
      expect(vo.amount).toBe(20000);
      expect(prisma.coachSchedule.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: ScheduleStatus.LOCKED }) }),
      );
    });
  });

  describe('T4-03 confirmAfterPaid / 超时释放', () => {
    it('confirmAfterPaid：订单 PENDING→PAID 且时段 LOCKED→BOOKED', async () => {
      const { svc, prisma } = build();
      prisma.coachingOrder.findFirst.mockResolvedValue({
        id: 500n,
        scheduleId: 100n,
        userId: 7n,
        status: CoachingOrderStatus.PENDING,
      });
      prisma.coachingOrder.updateMany.mockResolvedValue({ count: 1 });
      prisma.coachSchedule.updateMany.mockResolvedValue({ count: 1 });
      const r = await svc.confirmAfterPaid('500', '900');
      expect(r).toEqual({ ok: true });
      expect(prisma.coachSchedule.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: ScheduleStatus.BOOKED }) }),
      );
    });

    it('confirmAfterPaid 幂等：订单已 PAID 直接成功', async () => {
      const { svc, prisma } = build();
      prisma.coachingOrder.findFirst.mockResolvedValue({
        id: 500n,
        scheduleId: 100n,
        userId: 7n,
        status: CoachingOrderStatus.PAID,
      });
      const r = await svc.confirmAfterPaid('500');
      expect(r).toEqual({ ok: true });
      expect(prisma.coachingOrder.updateMany).not.toHaveBeenCalled();
    });

    it('releaseExpiredSlots：超时订单 CANCELLED 并释放时段', async () => {
      const { svc, prisma } = build();
      prisma.coachingOrder.findMany.mockResolvedValue([{ id: 500n, scheduleId: 100n }]);
      prisma.coachingOrder.updateMany.mockResolvedValue({ count: 1 });
      prisma.coachSchedule.updateMany.mockResolvedValue({ count: 1 });
      const released = await svc.releaseExpiredSlots(new Date());
      expect(released).toBe(1);
      expect(prisma.coachSchedule.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: ScheduleStatus.FREE }) }),
      );
    });
  });

  describe('T4-04 咨询评价（聚合更新评分）', () => {
    const finishedOrder = {
      id: 500n,
      userId: 7n,
      coachId: 1n,
      status: CoachingOrderStatus.FINISHED,
    };

    it('未完成订单不可评价 → 40000', async () => {
      const { svc, prisma } = build();
      prisma.coachingOrder.findFirst.mockResolvedValue({
        ...finishedOrder,
        status: CoachingOrderStatus.PENDING,
      });
      await expect(
        svc.reviewOrder('7', '500', { rating: 5 }),
      ).rejects.toMatchObject({ bizCode: 40000 });
    });

    it('评价成功：入库并聚合更新辅导师 rating 均值/计数', async () => {
      const { svc, prisma } = build();
      prisma.coachingOrder.findFirst.mockResolvedValue(finishedOrder);
      prisma.coachingReview.findUnique.mockResolvedValue(null);
      prisma.coachingReview.create.mockResolvedValue({ id: 10n });
      prisma.coachingReview.aggregate.mockResolvedValue({
        _avg: { rating: 4.5 },
        _count: { _all: 4 },
      });
      prisma.coach.update.mockResolvedValue({});
      const r = await svc.reviewOrder('7', '500', { rating: 4, content: '很专业' });
      expect(r.coachRating).toBe(4.5);
      expect(r.reviewCount).toBe(4);
      expect(prisma.coach.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ rating: 4.5, orderCount: 4 }) }),
      );
    });

    it('重复评价 → 40000', async () => {
      const { svc, prisma } = build();
      prisma.coachingOrder.findFirst.mockResolvedValue(finishedOrder);
      prisma.coachingReview.findUnique.mockResolvedValue({ id: 99n });
      await expect(
        svc.reviewOrder('7', '500', { rating: 5 }),
      ).rejects.toMatchObject({ bizCode: 40000 });
    });
  });
});