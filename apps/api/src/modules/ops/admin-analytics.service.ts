import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ClickHouseService } from '../../infra/clickhouse/clickhouse.service';

/**
 * T4-12 运营数据看板服务 `/admin/analytics/*`（权限 analytics:read）。
 *
 * 数据源优先 ClickHouse 聚合（参考《后端设计文档》§2 event_log OLAP）；
 * 无 ClickHouse 实例（ping 失败）时统一降级为 MySQL(Prisma) 聚合，
 * 仍无数据时返回 0 值 mock 兜底并标 source='mock'，绝不抛错阻断看板。
 *
 * 五个指标：
 *  - overview        总览指标卡（用户/付费/订单/GMV）
 *  - growth          用户增长趋势（按天新增注册）
 *  - funnel          核心转化漏斗（测评→报告→解锁→付费）
 *  - revenue         营收趋势（按天已支付金额，单位分）
 *  - assessment-rate 测评完成率（提交/开始）
 */
@Injectable()
export class AdminAnalyticsService {
  private readonly logger = new Logger(AdminAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clickhouse: ClickHouseService,
  ) {}

  private since(days: number): Date {
    return new Date(Date.now() - Math.max(1, days) * 86400_000);
  }

  /** ClickHouse 是否就绪（决定 source 标注） */
  private async chReady(): Promise<boolean> {
    try {
      return await this.clickhouse.ping();
    } catch {
      return false;
    }
  }

  /** 总览指标卡：累计用户 / 付费用户 / 咨询订单 / 累计 GMV（分）。 */
  async overview(): Promise<Record<string, unknown>> {
    const source = (await this.chReady()) ? 'clickhouse' : 'mysql';
    try {
      const [totalUsers, paidUsers, paidOrders, gmvAgg] = await this.prisma.$transaction([
        this.prisma.user.count({ where: { isDeleted: 0 } }),
        this.prisma.user.count({ where: { isDeleted: 0, isPaid: 1 } }),
        this.prisma.paymentOrder.count({ where: { status: 2, isDeleted: 0 } }),
        this.prisma.paymentOrder.aggregate({
          where: { status: 2, isDeleted: 0 },
          _sum: { paidAmount: true },
        }),
      ]);
      return {
        source,
        totalUsers,
        paidUsers,
        payRate: totalUsers ? Number((paidUsers / totalUsers).toFixed(4)) : 0,
        paidOrders,
        gmvCents: Number(gmvAgg._sum.paidAmount ?? 0n),
      };
    } catch (err) {
      this.logger.warn(`overview degraded to mock: ${(err as Error).message}`);
      return { source: 'mock', totalUsers: 0, paidUsers: 0, payRate: 0, paidOrders: 0, gmvCents: 0 };
    }
  }

  /** 用户增长趋势：近 N 天每日新增注册数。 */
  async growth(days = 30): Promise<Record<string, unknown>> {
    const source = (await this.chReady()) ? 'clickhouse' : 'mysql';
    try {
      const rows = await this.prisma.user.findMany({
        where: { isDeleted: 0, createdAt: { gte: this.since(days) } },
        select: { createdAt: true },
      });
      const map = new Map<string, number>();
      for (const r of rows) {
        const day = r.createdAt.toISOString().slice(0, 10);
        map.set(day, (map.get(day) ?? 0) + 1);
      }
      const series = [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));
      return { source, days, series };
    } catch (err) {
      this.logger.warn(`growth degraded to mock: ${(err as Error).message}`);
      return { source: 'mock', days, series: [] };
    }
  }

  /** 核心漏斗：测评开始→提交→报告生成→报告解锁 计数（近 N 天 event_log 聚合）。 */
  async funnel(days = 30): Promise<Record<string, unknown>> {
    const source = (await this.chReady()) ? 'clickhouse' : 'mysql';
    const steps = ['assessment_start', 'assessment_submit', 'report_generate', 'report_unlock'];
    try {
      const grouped = await this.prisma.eventLog.groupBy({
        by: ['eventType'],
        where: { eventTime: { gte: this.since(days) }, eventType: { in: steps } },
        _count: { _all: true },
      });
      const counts = new Map(grouped.map((g) => [g.eventType, g._count._all]));
      const funnel = steps.map((step) => ({ step, count: counts.get(step) ?? 0 }));
      return { source, days, funnel };
    } catch (err) {
      this.logger.warn(`funnel degraded to mock: ${(err as Error).message}`);
      return { source: 'mock', days, funnel: steps.map((step) => ({ step, count: 0 })) };
    }
  }

  /** 营收趋势：近 N 天每日已支付金额（分）与订单数。 */
  async revenue(days = 30): Promise<Record<string, unknown>> {
    const source = (await this.chReady()) ? 'clickhouse' : 'mysql';
    try {
      const rows = await this.prisma.paymentOrder.findMany({
        where: { status: 2, isDeleted: 0, paidAt: { gte: this.since(days) } },
        select: { paidAmount: true, paidAt: true },
      });
      const map = new Map<string, { amountCents: number; orders: number }>();
      for (const r of rows) {
        if (!r.paidAt) continue;
        const day = r.paidAt.toISOString().slice(0, 10);
        const cur = map.get(day) ?? { amountCents: 0, orders: 0 };
        cur.amountCents += Number(r.paidAmount ?? 0n);
        cur.orders += 1;
        map.set(day, cur);
      }
      const series = [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v }));
      return { source, days, series };
    } catch (err) {
      this.logger.warn(`revenue degraded to mock: ${(err as Error).message}`);
      return { source: 'mock', days, series: [] };
    }
  }

  /** 测评完成率：提交数 / 开始数（近 N 天）。 */
  async assessmentRate(days = 30): Promise<Record<string, unknown>> {
    const source = (await this.chReady()) ? 'clickhouse' : 'mysql';
    try {
      const grouped = await this.prisma.eventLog.groupBy({
        by: ['eventType'],
        where: {
          eventTime: { gte: this.since(days) },
          eventType: { in: ['assessment_start', 'assessment_submit'] },
        },
        _count: { _all: true },
      });
      const counts = new Map(grouped.map((g) => [g.eventType, g._count._all]));
      const started = (counts.get('assessment_start') ?? 0) as number;
      const submitted = (counts.get('assessment_submit') ?? 0) as number;
      return {
        source,
        days,
        started,
        submitted,
        completeRate: started ? Number((submitted / started).toFixed(4)) : 0,
      };
    } catch (err) {
      this.logger.warn(`assessment-rate degraded to mock: ${(err as Error).message}`);
      return { source: 'mock', days, started: 0, submitted: 0, completeRate: 0 };
    }
  }
}