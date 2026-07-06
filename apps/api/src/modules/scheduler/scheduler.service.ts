import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * SchedulerService — 定时任务（BE-11）。
 *
 * 注册在 SchedulerModule，由 @nestjs/schedule 驱动。
 * 所有任务设计为幂等（可重复执行）、优雅降级（失败不抛崩溃）。
 * 生产环境建议加分布式锁（Redis）防止多实例重复执行。
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 注销用户 T+30 清理：每天凌晨 3:00 执行。
   * 删除 deactivatedAt 距今超过 30 天且 status=deactivating 的用户数据。
   */
  @Cron('0 3 * * *', { name: 'cleanup-deactivated-users' })
  async cleanupDeactivatedUsers(): Promise<void> {
    this.logger.log('[CRON] cleanupDeactivatedUsers 开始执行');
    try {
      const cutoff = new Date(Date.now() - 30 * 86400_000);
      // 查找需清理的注销用户
      const users = await this.prisma.user.findMany({
        where: {
          isDeleted: 0,
          status: 2, // deactivating
          deactivatedAt: { lte: cutoff },
        },
        select: { id: true, userNo: true },
      });
      if (users.length === 0) {
        this.logger.log('[CRON] cleanupDeactivatedUsers: 无需清理');
        return;
      }

      const ids = users.map((u) => u.id);
      // 软删除用户（数据保留策略——合规考虑）
      await this.prisma.user.updateMany({
        where: { id: { in: ids } },
        data: { isDeleted: 1, deletedAt: new Date(), status: 0 },
      });
      this.logger.log(
        `[CRON] cleanupDeactivatedUsers: 已清理 ${ids.length} 个注销用户 (over 30d)`,
      );
    } catch (e) {
      this.logger.warn(`[CRON] cleanupDeactivatedUsers 失败: ${(e as Error).message}`);
    }
  }

  /**
   * 事件日志 90 天 TTL 清理：每天凌晨 4:00 执行。
   * 删除 event_time 超过 90 天的事件日志（节约 MySQL 存储）。
   * 注意: event_log 为复合主键 (id, event_time)，删旧数据不影响实时写入。
   */
  @Cron('0 4 * * *', { name: 'cleanup-stale-event-logs' })
  async cleanupStaleEventLogs(): Promise<void> {
    this.logger.log('[CRON] cleanupStaleEventLogs 开始执行');
    try {
      const cutoff = new Date(Date.now() - 90 * 86400_000);
      // 防止一次性删太多锁表：分批删除，每批 10000 条
      let deleted = 0;
      let batch: number;
      do {
        const result = await this.prisma.$executeRawUnsafe(
          'DELETE FROM event_log WHERE event_time < ? LIMIT 10000',
          cutoff,
        );
        batch = result as number;
        deleted += batch;
      } while (batch > 0);

      this.logger.log(
        `[CRON] cleanupStaleEventLogs: 已清理 ${deleted} 条 (over 90d)`,
      );
    } catch (e) {
      this.logger.warn(`[CRON] cleanupStaleEventLogs 失败: ${(e as Error).message}`);
    }
  }

  /**
   * 辅导排期释放：每 5 分钟执行。
   * 已锁定但过期未支付的排期槽位（lockExpireAt < now 且 status=locked）释放为可用。
   */
  @Cron('*/5 * * * *', { name: 'release-expired-schedules' })
  async releaseExpiredSchedules(): Promise<void> {
    try {
      const now = new Date();
      const result = await this.prisma.coachSchedule.updateMany({
        where: {
          status: 2, // locked
          lockExpireAt: { lte: now },
        },
        data: { status: 1, lockExpireAt: null, orderId: null },
      });
      if ((result as any).count > 0) {
        this.logger.log(
          `[CRON] releaseExpiredSchedules: 已释放 ${(result as any).count} 个过期锁定排期`,
        );
      }
    } catch (e) {
      this.logger.warn(`[CRON] releaseExpiredSchedules 失败: ${(e as Error).message}`);
    }
  }

  /**
   * 激活码过期标记：每小时执行。
   * 将 expireAt < now 且未使用的激活码标记为 status=2 (expired)。
   */
  @Cron('0 * * * *', { name: 'mark-expired-activation-codes' })
  async markExpiredActivationCodes(): Promise<void> {
    try {
      const now = new Date();
      const result = await this.prisma.activationCode.updateMany({
        where: {
          status: 0, // unused
          expireAt: { not: null, lte: now },
        },
        data: { status: 2 },
      });
      if ((result as any).count > 0) {
        this.logger.log(
          `[CRON] markExpiredActivationCodes: 已标记 ${(result as any).count} 个过期激活码`,
        );
      }
    } catch (e) {
      this.logger.warn(`[CRON] markExpiredActivationCodes 失败: ${(e as Error).message}`);
    }
  }
}
