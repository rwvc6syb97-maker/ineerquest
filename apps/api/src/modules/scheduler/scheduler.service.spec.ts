import { SchedulerService } from './scheduler.service';

/**
 * SchedulerService 单测：纯内存 mock Prisma，验证 4 个 Cron job 的 SQL 调用参数。
 */
describe('SchedulerService (BE-11)', () => {
  const build = () => {
    const prisma: any = {
      user: { findMany: jest.fn(), updateMany: jest.fn() },
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      coachSchedule: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      career: { findMany: jest.fn().mockResolvedValue([]) },
      dailyBrief: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: 1n }) },
    };
    const svc = new SchedulerService(prisma as any);
    return { svc, prisma };
  };

  describe('cleanupDeactivatedUsers', () => {
    it('T+30 之后删除注销用户', async () => {
      const { svc, prisma } = build();
      prisma.user.findMany.mockResolvedValue([{ id: 1n, userNo: 'U001' }]);

      await svc.cleanupDeactivatedUsers();

      // 验证查询条件：status=2 + deactivatedAt <= 30天前
      const findArgs = prisma.user.findMany.mock.calls[0][0];
      expect(findArgs.where.status).toBe(2);
      expect(findArgs.where.deactivatedAt.lte).toBeInstanceOf(Date);

      // 验证更新操作
      expect(prisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isDeleted: 1, status: 0 }),
        }),
      );
    });

    it('无待清理用户时直接返回', async () => {
      const { svc, prisma } = build();
      prisma.user.findMany.mockResolvedValue([]);
      await svc.cleanupDeactivatedUsers();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('cleanupStaleEventLogs', () => {
    it('90 天旧日志分批删除', async () => {
      const { svc, prisma } = build();
      // 第一次执行删 10000，第二次删 0
      prisma.$executeRawUnsafe
        .mockResolvedValueOnce(10000)
        .mockResolvedValueOnce(0);

      await svc.cleanupStaleEventLogs();

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM event_log WHERE event_time'),
        expect.any(Date),
      );
    });

    it('异常时不抛崩溃', async () => {
      const { svc, prisma } = build();
      prisma.$executeRawUnsafe.mockRejectedValue(new Error('DB down'));
      await expect(svc.cleanupStaleEventLogs()).resolves.toBeUndefined();
    });
  });

  describe('releaseExpiredSchedules', () => {
    it('释放过期的锁定排期', async () => {
      const { svc, prisma } = build();
      prisma.coachSchedule.updateMany.mockResolvedValue({ count: 3 });

      await svc.releaseExpiredSchedules();

      expect(prisma.coachSchedule.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 2 }),
          data: expect.objectContaining({ status: 1 }),
        }),
      );
    });
  });

  describe('backfillDailyBriefs (缺陷1 历史回补)', () => {
    it('为全体活跃用户回补缺失日期的日报（幂等跳过已存在）', async () => {
      const { svc, prisma } = build();
      prisma.career.findMany.mockResolvedValue([
        { id: 10n, name: '产品经理', description: '产品方向', prospect: '前景良好' },
        { id: 11n, name: '数据分析师', description: '数据方向', prospect: null },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: 100n }, { id: 200n }]);
      // 100 号用户已有 today 日报 → 应跳过当天，仅补其余日期。
      // today 用与被测代码相同的运行时 UTC 零点算法，确保日期键命中。
      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      prisma.dailyBrief.findMany.mockImplementation((args: any) =>
        Promise.resolve(args.where.userId === 100n ? [{ briefDate: today }] : []),
      );

      const r = await svc.backfillDailyBriefs(3);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { isDeleted: 0, status: 1 },
        select: { id: true },
      });
      expect(r.users).toBe(2);
      // 用户100补2天(3-1已存在)、用户200补3天 = 5
      expect(prisma.dailyBrief.create).toHaveBeenCalledTimes(5);
      const firstCreate = prisma.dailyBrief.create.mock.calls[0][0];
      expect(firstCreate.data.status).toBe(1);
      expect(Array.isArray(firstCreate.data.itemsData)).toBe(true);
      expect(firstCreate.data.itemsData[0]).toHaveProperty('careerId');
    });

    it('career 表为空时跳过生成', async () => {
      const { svc, prisma } = build();
      prisma.career.findMany.mockResolvedValue([]);
      const r = await svc.backfillDailyBriefs(7);
      expect(r.created).toBe(0);
      expect(prisma.dailyBrief.create).not.toHaveBeenCalled();
    });

    it('P2002 并发重复视为幂等成功不抛错', async () => {
      const { svc, prisma } = build();
      prisma.career.findMany.mockResolvedValue([{ id: 1n, name: 'A', description: 'd', prospect: null }]);
      prisma.user.findMany.mockResolvedValue([{ id: 1n }]);
      prisma.dailyBrief.create.mockRejectedValue({ code: 'P2002' });
      await expect(svc.backfillDailyBriefs(1)).resolves.toEqual(
        expect.objectContaining({ users: 1, created: 0, days: 1 }),
      );
    });
  });
});
