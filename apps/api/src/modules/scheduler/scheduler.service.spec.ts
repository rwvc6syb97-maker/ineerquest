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
      activationCode: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
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

  describe('markExpiredActivationCodes', () => {
    it('标记已过期的未使用激活码', async () => {
      const { svc, prisma } = build();
      prisma.activationCode.updateMany.mockResolvedValue({ count: 5 });

      await svc.markExpiredActivationCodes();

      expect(prisma.activationCode.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 0 }),
          data: { status: 2 },
        }),
      );
    });
  });
});
