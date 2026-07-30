import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ClickHouseService } from '../../infra/clickhouse/clickhouse.service';
import { MessageRole } from '../ai-chat/ai-chat.constants';

/**
 * 功能模块使用量 moduleKey 枚举与展示名（§4.2）。
 * 计数源均走权威业务表（不走 event_log），见各方法内的 counter 映射。
 */
const MODULE_META: Array<{ key: string; name: string }> = [
  { key: 'assessment', name: 'MBTI 测评' },
  { key: 'report', name: '报告生成' },
  { key: 'careerPlan', name: '职业规划' },
  { key: 'resume', name: '简历生成' },
  { key: 'interview', name: '模拟面试' },
  { key: 'interviewBank', name: '面试题库评分' },
  { key: 'aiChat', name: 'AI 对话' },
  { key: 'coaching', name: '真人辅导' },
  { key: 'dailyBrief', name: '职业日报' },
];
const MODULE_KEYS = MODULE_META.map((m) => m.key);

/** 合法 moduleKey 集合（供 controller 校验 module-trend 入参，非法→4000）。 */
export const MODULE_USAGE_KEYS: readonly string[] = MODULE_KEYS;

/**
 * T4-12 运营数据看板服务 `/admin/analytics/*`（权限 analytics:read）。
 *
 * 【会员付费彻底移除·监控改造 §4】营收监控整体下线（revenue 端点已删除、overview
 * 移除付费/GMV 字段、funnel 去 report_unlock 步），监控重心改为「功能模块使用趋势」。
 *
 * 数据源：全部走权威业务表聚合（Prisma/MySQL），弃用 event_log；
 * 聚合异常时返回 0 值并标 source='mock'，绝不抛错阻断看板。
 *
 * 指标：
 *  - overview        总览指标卡（累计用户/近7日新增/测评/报告/AI 调用合计）
 *  - growth          用户增长趋势（按天新增注册）
 *  - funnel          核心转化漏斗（测评开始→测评提交→报告生成，三步）
 *  - assessment-rate 测评完成率（assessment_record 源；含报告生成数分列）
 *  - module-usage    功能模块使用量分布（近 N 天，各 moduleKey 计数+占比）
 *  - module-trend    功能模块使用趋势（近 N 天按日聚合，北京时区，缺口补 0）
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

  /**
   * 总览指标卡（§5.1）：累计用户 / 近7日新增 / 测评数 / 报告数 / AI 调用合计。
   * aiCallCount = careerPlan(career_growth_plan) + resume(ai_resume_doc)
   *             + interview(ai_interview) + aiChat(ai_message role=user) 四项调用合计。
   * 已移除 paidUsers/payRate/paidOrders/gmvCents（营收监控下线）。
   */
  async overview(): Promise<Record<string, unknown>> {
    const source = 'mysql';
    try {
      const [totalUsers, newUsers7d, assessmentCount, reportCount, careerPlan, resume, interview, aiChat] =
        await this.prisma.$transaction([
          this.prisma.user.count({ where: { isDeleted: 0 } }),
          this.prisma.user.count({ where: { isDeleted: 0, createdAt: { gte: this.since(7) } } }),
          this.prisma.assessmentRecord.count({ where: { isDeleted: 0 } }),
          this.prisma.report.count({ where: { isDeleted: 0 } }),
          this.prisma.careerGrowthPlan.count({ where: { isDeleted: 0 } }),
          this.prisma.aiResumeDoc.count({ where: { isDeleted: 0 } }),
          this.prisma.aiInterview.count(),
          this.prisma.aiMessage.count({ where: { role: MessageRole.USER, isDeleted: 0 } }),
        ]);
      return {
        source,
        totalUsers,
        newUsers7d,
        assessmentCount,
        reportCount,
        aiCallCount: careerPlan + resume + interview + aiChat,
      };
    } catch (err) {
      this.logger.warn(`overview degraded to mock: ${(err as Error).message}`);
      return {
        source: 'mock',
        totalUsers: 0,
        newUsers7d: 0,
        assessmentCount: 0,
        reportCount: 0,
        aiCallCount: 0,
      };
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
   * 核心转化漏斗（§5.3，口径基线强制）：全漏斗弃用 event_log，改走权威业务表聚合，
   * 与首页 stats / assessmentRate 口径完全自洽。
   *
   * 三步计数（全量口径；days 保留兼容前端但不约束计数）：
   *   step1 assessment_start  = count(assessment_record WHERE isDeleted=0)              // = assessmentRate.started
   *   step2 assessment_submit = count(assessment_record WHERE status=2 AND isDeleted=0) // = submitted = 首页 completedCount
   *   step3 report_generate   = count(report WHERE isDeleted=0)                         // = assessmentRate.reportCount
   *
   * 【监控改造 §4.1.3】已删除 report_unlock 步（营收监控下线）。
   * 返回结构：{ source:'assessment_record', days, funnel:[{step,count}×3] }。
   */
  async funnel(days = 30): Promise<Record<string, unknown>> {
    const steps = ['assessment_start', 'assessment_submit', 'report_generate'];
    try {
      const [started, submitted, reportGenerated] = await this.prisma.$transaction([
        this.prisma.assessmentRecord.count({ where: { isDeleted: 0 } }),
        this.prisma.assessmentRecord.count({ where: { status: 2, isDeleted: 0 } }),
        this.prisma.report.count({ where: { isDeleted: 0 } }),
      ]);
      const countByStep: Record<string, number> = {
        assessment_start: started,
        assessment_submit: submitted,
        report_generate: reportGenerated,
      };
      const funnel = steps.map((step) => ({ step, count: countByStep[step] ?? 0 }));
      return { source: 'assessment_record', days, funnel };
    } catch (err) {
      // 保留降级但显式标 source='mock' 供前端识别
      this.logger.warn(`funnel degraded to mock: ${(err as Error).message}`);
      return { source: 'mock', days, funnel: steps.map((step) => ({ step, count: 0 })) };
    }
  }

  /**
   * 各 moduleKey 的近 since 天计数器（§4.2 全部走权威业务表，不走 event_log）。
   * 返回按 MODULE_META 顺序的 count 数组，供 usage/trend 复用。
   */
  private moduleCounters(since: Date) {
    return {
      assessment: this.prisma.assessmentRecord.count({ where: { isDeleted: 0, createdAt: { gte: since } } }),
      report: this.prisma.report.count({ where: { isDeleted: 0, createdAt: { gte: since } } }),
      careerPlan: this.prisma.careerGrowthPlan.count({ where: { isDeleted: 0, createdAt: { gte: since } } }),
      resume: this.prisma.aiResumeDoc.count({ where: { isDeleted: 0, createdAt: { gte: since } } }),
      interview: this.prisma.aiInterview.count({ where: { createdAt: { gte: since } } }),
      interviewBank: this.prisma.aiInterviewQa.count({ where: { score: { not: null }, createdAt: { gte: since } } }),
      aiChat: this.prisma.aiMessage.count({ where: { role: MessageRole.USER, isDeleted: 0, createdAt: { gte: since } } }),
      coaching: this.prisma.coachingOrder.count({ where: { isDeleted: 0, createdAt: { gte: since } } }),
      dailyBrief: this.prisma.dailyBrief.count({ where: { createdAt: { gte: since } } }),
    } as Record<string, Promise<number>>;
  }

  /**
   * GET /admin/analytics/module-usage（§5.4）：近 N 天各功能模块使用量分布。
   * items 按 count 降序；ratio=count/total（total=0→0），保留 4 位小数。
   */
  async moduleUsage(days = 30): Promise<Record<string, unknown>> {
    const since = this.since(days);
    try {
      const counters = this.moduleCounters(since);
      const counts = await Promise.all(MODULE_KEYS.map((k) => counters[k]));
      const countByKey = new Map(MODULE_KEYS.map((k, i) => [k, counts[i]]));
      const total = counts.reduce((a, b) => a + b, 0);
      const items = MODULE_META.map((m) => {
        const count = countByKey.get(m.key) ?? 0;
        return {
          moduleKey: m.key,
          moduleName: m.name,
          count,
          ratio: total ? Number((count / total).toFixed(4)) : 0,
        };
      }).sort((a, b) => b.count - a.count);
      return { source: 'mysql', days, total, items };
    } catch (err) {
      this.logger.warn(`module-usage degraded to mock: ${(err as Error).message}`);
      const items = MODULE_META.map((m) => ({ moduleKey: m.key, moduleName: m.name, count: 0, ratio: 0 }));
      return { source: 'mock', days, total: 0, items };
    }
  }

  /** 将 UTC 时间转为北京时区(YYYY-MM-DD) 日期键。 */
  private beijingDay(d: Date): string {
    return new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
  }

  /** 生成从 since 到今天的连续北京时区日期序列（含端点）。 */
  private dateRange(days: number): string[] {
    const out: string[] = [];
    const now = Date.now();
    for (let i = Math.max(1, days) - 1; i >= 0; i--) {
      out.push(this.beijingDay(new Date(now - i * 86400_000)));
    }
    return [...new Set(out)];
  }

  /**
   * 单个模块近 days 天按北京时区日聚合计数。moduleKey 缺省不校验（由调用方保证合法）。
   * 返回 Map<YYYY-MM-DD, number>。
   */
  private async trendOf(moduleKey: string, since: Date): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    const push = (rows: Array<{ createdAt: Date }>) => {
      for (const r of rows) {
        const day = this.beijingDay(r.createdAt);
        map.set(day, (map.get(day) ?? 0) + 1);
      }
    };
    const sel = { createdAt: true } as const;
    switch (moduleKey) {
      case 'assessment':
        push(await this.prisma.assessmentRecord.findMany({ where: { isDeleted: 0, createdAt: { gte: since } }, select: sel }));
        break;
      case 'report':
        push(await this.prisma.report.findMany({ where: { isDeleted: 0, createdAt: { gte: since } }, select: sel }));
        break;
      case 'careerPlan':
        push(await this.prisma.careerGrowthPlan.findMany({ where: { isDeleted: 0, createdAt: { gte: since } }, select: sel }));
        break;
      case 'resume':
        push(await this.prisma.aiResumeDoc.findMany({ where: { isDeleted: 0, createdAt: { gte: since } }, select: sel }));
        break;
      case 'interview':
        push(await this.prisma.aiInterview.findMany({ where: { createdAt: { gte: since } }, select: sel }));
        break;
      case 'interviewBank':
        push(await this.prisma.aiInterviewQa.findMany({ where: { score: { not: null }, createdAt: { gte: since } }, select: sel }));
        break;
      case 'aiChat':
        push(await this.prisma.aiMessage.findMany({ where: { role: MessageRole.USER, isDeleted: 0, createdAt: { gte: since } }, select: sel }));
        break;
      case 'coaching':
        push(await this.prisma.coachingOrder.findMany({ where: { isDeleted: 0, createdAt: { gte: since } }, select: sel }));
        break;
      case 'dailyBrief':
        push(await this.prisma.dailyBrief.findMany({ where: { createdAt: { gte: since } }, select: sel }));
        break;
    }
    return map;
  }

  /**
   * GET /admin/analytics/module-trend（§5.5）：近 N 天各模块使用趋势，按北京时区日聚合，缺口补 0。
   * moduleKey 缺省返回全部模块分组；传入则仅该模块。moduleKey 非法由 controller 拦截返回 4000。
   * series 每项：{ date:'YYYY-MM-DD', [moduleKey]:number, ... }
   */
  async moduleTrend(days = 30, moduleKey?: string): Promise<Record<string, unknown>> {
    const since = this.since(days);
    const dates = this.dateRange(days);
    const keys = moduleKey ? [moduleKey] : MODULE_KEYS;
    try {
      const maps = await Promise.all(keys.map((k) => this.trendOf(k, since)));
      const series = dates.map((date) => {
        const row: Record<string, unknown> = { date };
        keys.forEach((k, i) => {
          row[k] = maps[i].get(date) ?? 0;
        });
        return row;
      });
      return { source: 'mysql', days, series };
    } catch (err) {
      this.logger.warn(`module-trend degraded to mock: ${(err as Error).message}`);
      const series = dates.map((date) => {
        const row: Record<string, unknown> = { date };
        keys.forEach((k) => (row[k] = 0));
        return row;
      });
      return { source: 'mock', days, series };
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