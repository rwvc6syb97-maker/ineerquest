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

  /** 日报每日条目数 / 历史回补天数（含当天）。 */
  private static readonly BRIEF_ITEMS_PER_DAY = 3;
  private static readonly BRIEF_BACKFILL_DAYS = 7;

  /**
   * 职业热点日报生成 + 历史回补：每天凌晨 2:00 执行。
   *
   * PM 裁定（方案C）：为【全体活跃用户】回补过去 N 天（含当天）缺失的 daily_brief。
   * - 活跃用户：user.isDeleted=0 且 status=1；
   * - 内容源：career 表（status=1, isDeleted=0）随机挑选 N 条，映射 items {title,summary,careerId}；
   * - 幂等：借助 uk_user_date 唯一键，仅对「缺失日期」create，已存在日期跳过（不覆盖）；
   * - status 写 1（已发布），保持 getMine 仅读 status=1 的语义不变；
   * - 数据隔离：只写 daily_brief，userId 严格隔离。
   */
  @Cron('0 2 * * *', { name: 'generate-daily-brief' })
  async generateDailyBriefs(): Promise<void> {
    this.logger.log('[CRON] generateDailyBriefs 开始执行');
    try {
      const summary = await this.backfillDailyBriefs(SchedulerService.BRIEF_BACKFILL_DAYS);
      this.logger.log(
        `[CRON] generateDailyBriefs: 覆盖用户 ${summary.users} 人，新建日报 ${summary.created} 份（回补 ${summary.days} 天）`,
      );
    } catch (e) {
      this.logger.warn(`[CRON] generateDailyBriefs 失败: ${(e as Error).message}`);
    }
  }

  /**
   * 为全体活跃用户回补过去 days 天（含当天）缺失的日报。
   * 幂等可重复执行；返回覆盖用户数 / 新建条目数（便于日志与单测断言）。
   */
  async backfillDailyBriefs(days: number): Promise<{ users: number; created: number; days: number }> {
    const backfillDays = Math.max(1, days);
    // 目标日期集合（UTC 零点，含当天，倒推 backfillDays-1 天）
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dates: Date[] = [];
    for (let i = 0; i < backfillDays; i++) {
      dates.push(new Date(today.getTime() - i * 86400_000));
    }

    // 内容源池：活跃职业库
    const careers = await this.prisma.career.findMany({
      where: { status: 1, isDeleted: 0 },
      select: { id: true, name: true, description: true, prospect: true },
    });
    if (careers.length === 0) {
      this.logger.warn('[CRON] backfillDailyBriefs: career 表无可用数据，跳过生成');
      return { users: 0, created: 0, days: backfillDays };
    }

    // 全体活跃用户
    const users = await this.prisma.user.findMany({
      where: { isDeleted: 0, status: 1 },
      select: { id: true },
    });

    let created = 0;
    const earliest = dates[dates.length - 1];
    for (const user of users) {
      // 该用户在目标区间内已有的日报日期（去重跳过）
      const existing = await this.prisma.dailyBrief.findMany({
        where: { userId: user.id, briefDate: { gte: earliest, lte: today } },
        select: { briefDate: true },
      });
      const existingKeys = new Set(existing.map((e) => this.dateKey(e.briefDate)));

      for (const date of dates) {
        if (existingKeys.has(this.dateKey(date))) continue;
        const items = this.buildBriefItems(careers, date, user.id);
        try {
          await this.prisma.dailyBrief.create({
            data: { userId: user.id, briefDate: date, itemsData: items, status: 1 },
          });
          created++;
        } catch (e) {
          // 并发/重复（uk_user_date, P2002）视为幂等成功；其它错误记录不中断整体回补
          if ((e as { code?: string }).code !== 'P2002') {
            this.logger.warn(
              `[CRON] backfillDailyBriefs: userId=${user.id} date=${this.dateKey(date)} 生成失败: ${(e as Error).message}`,
            );
          }
        }
      }
    }
    return { users: users.length, created, days: backfillDays };
  }

  /** 从职业库为某日构造 items（确定性挑选，保证同一 user+date 稳定可回补）。 */
  private buildBriefItems(
    careers: { id: bigint; name: string; description: string | null; prospect: string | null }[],
    date: Date,
    userId: bigint,
  ): { title: string; summary: string; careerId: string }[] {
    const count = Math.min(SchedulerService.BRIEF_ITEMS_PER_DAY, careers.length);
    // 以 (userId + 日期) 派生偏移，个性化且可复现，不引入随机不可回补性
    const seed = Number(userId % 100000n) + Math.floor(date.getTime() / 86400_000);
    const items: { title: string; summary: string; careerId: string }[] = [];
    for (let i = 0; i < count; i++) {
      const c = careers[(seed + i) % careers.length];
      const summarySrc = (c.prospect ?? c.description ?? '').trim();
      items.push({
        title: `职业热点 · ${c.name}`,
        summary: summarySrc.length > 0 ? summarySrc.slice(0, 120) : `了解 ${c.name} 的发展前景与技能要求。`,
        careerId: c.id.toString(),
      });
    }
    return items;
  }

  /** UTC 日期键 YYYY-MM-DD（用于去重比对）。 */
  private dateKey(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
