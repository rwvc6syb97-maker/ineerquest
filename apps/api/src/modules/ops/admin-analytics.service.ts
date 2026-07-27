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
 *  - assessment-rate 测评完成率（assessment_record 源；含报告生成数分列）
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

  /**
   * 核心转化漏斗（口径基线强制）：全漏斗弃用 event_log，改走权威业务表聚合，
   * 与首页 stats / assessmentRate 口径完全自洽。历史问题：assessment_start /
   * assessment_submit 全代码库无 analytics.fire 上报点，event_log 恒无这两类事件，
   * 导致漏斗前两步恒 0（与 assessmentRate 早前弃用 event_log 属同类整改）。
   *
   * 四步计数（全量口径，与 assessmentRate 一致；days 保留兼容前端但不约束计数）：
   *   step1 assessment_start  = count(assessment_record WHERE isDeleted=0)          // = assessmentRate.started
   *   step2 assessment_submit = count(assessment_record WHERE status=2 AND isDeleted=0) // = submitted = 首页 completedCount
   *   step3 report_generate   = count(report WHERE isDeleted=0)                     // = assessmentRate.reportCount
   *   step4 report_unlock     = count(report WHERE isUnlocked=1 AND isDeleted=0)    // Report.isUnlocked(1=已解锁,schema.prisma:287)
   *
   * 返回结构不变：{ source:'assessment_record', days, funnel:[{step,count}×4] }，四步顺序不变。
   */
  async funnel(days = 30): Promise<Record<string, unknown>> {
    const steps = ['assessment_start', 'assessment_submit', 'report_generate', 'report_unlock'];
    try {
      const [started, submitted, reportGenerated, reportUnlocked] = await this.prisma.$transaction([
        this.prisma.assessmentRecord.count({ where: { isDeleted: 0 } }),
        this.prisma.assessmentRecord.count({ where: { status: 2, isDeleted: 0 } }),
        this.prisma.report.count({ where: { isDeleted: 0 } }),
        this.prisma.report.count({ where: { isUnlocked: 1, isDeleted: 0 } }),
      ]);
      const countByStep: Record<string, number> = {
        assessment_start: started,
        assessment_submit: submitted,
        report_generate: reportGenerated,
        report_unlock: reportUnlocked,
      };
      const funnel = steps.map((step) => ({ step, count: countByStep[step] ?? 0 }));
      return { source: 'assessment_record', days, funnel };
    } catch (err) {
      // 保留降级但不再返回全 event_log 空值误导：显式标 source='mock' 供前端识别
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

  /**
   * 测评完成率（口径基线 §一.1 强制）：以 assessment_record 表为唯一权威源聚合。
   *   started       = count(assessment_record WHERE isDeleted=0)
   *   submitted     = count(assessment_record WHERE status=SUBMITTED(2) AND isDeleted=0)
   *   completeRate  = submitted / started（无数据兜底 0）
   * 与首页 stats.completedCount(=submitted) 完全自洽。已移除对 event_log 的比率依赖。
   *
   * 分列两指标（口径基线 §一.3）：
   *   assessmentSubmitted = submitted（测评提交数，assessment_record 源）
   *   reportCount         = count(report WHERE isDeleted=0)（报告生成数，report 源）
   * 二者语义不同（一次提交可不生成报告 / 报告有配额），标签独立不得混用。
   *
   * @param days 保留入参用于兼容前端；比率口径为全量，仅趋势 series 受 days 约束（可选 event_log）。
   */
  async assessmentRate(days = 30): Promise<Record<string, unknown>> {
    try {
      const [started, submitted, reportCount] = await this.prisma.$transaction([
        this.prisma.assessmentRecord.count({ where: { isDeleted: 0 } }),
        this.prisma.assessmentRecord.count({ where: { status: 2, isDeleted: 0 } }),
        this.prisma.report.count({ where: { isDeleted: 0 } }),
      ]);
      return {
        source: 'assessment_record',
        days,
        started,
        submitted,
        completeRate: started ? Number((submitted / started).toFixed(4)) : 0,
        // 分列指标：测评提交数 vs 报告生成数（禁止混用）
        assessmentSubmitted: submitted,
        reportCount,
      };
    } catch (err) {
      this.logger.warn(`assessment-rate degraded to zero: ${(err as Error).message}`);
      return {
        source: 'mock',
        days,
        started: 0,
        submitted: 0,
        completeRate: 0,
        assessmentSubmitted: 0,
        reportCount: 0,
      };
    }
  }
}