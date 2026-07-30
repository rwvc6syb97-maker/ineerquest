import { AdminAnalyticsService } from './admin-analytics.service';

/**
 * 监控改造（会员付费彻底移除 §4/§5）单测：
 *  - funnel 改三步（去 report_unlock），权威业务表口径不变；
 *  - 新增 module-usage / module-trend 覆盖：计数源、占比、降序、缺口补 0、单模块过滤。
 * 全漏斗/模块统计弃用 event_log，改走 assessment_record / report / ai_* 等权威业务表。
 */
describe('AdminAnalyticsService.funnel（三步）', () => {
  const makeService = (opts: { started: number; submitted: number; reportGenerated: number }) => {
    // $transaction([...]) 按数组顺序返回：started, submitted, reportGenerated
    const prisma: any = {
      $transaction: jest.fn(async () => [opts.started, opts.submitted, opts.reportGenerated]),
      assessmentRecord: { count: jest.fn() },
      report: { count: jest.fn() },
      eventLog: { groupBy: jest.fn(async () => { throw new Error('event_log 不应被 funnel 使用'); }) },
    };
    const clickhouse: any = { ping: jest.fn(async () => false) };
    return { service: new AdminAnalyticsService(prisma, clickhouse), prisma };
  };

  it('三步取权威业务表计数、顺序与 source 正确（无 report_unlock）', async () => {
    const { service } = makeService({ started: 100, submitted: 60, reportGenerated: 40 });
    const res: any = await service.funnel(30);

    expect(res.source).toBe('assessment_record');
    expect(res.days).toBe(30);
    expect(res.funnel).toEqual([
      { step: 'assessment_start', count: 100 },
      { step: 'assessment_submit', count: 60 },
      { step: 'report_generate', count: 40 },
    ]);
    // 断言不再包含 report_unlock 步
    expect(res.funnel.map((f: any) => f.step)).not.toContain('report_unlock');
  });

  it('步骤1/2 与 assessmentRate started/submitted 口径自洽', async () => {
    const { service } = makeService({ started: 88, submitted: 52, reportGenerated: 30 });
    const res: any = await service.funnel();
    expect(res.funnel[0].count).toBe(88);
    expect(res.funnel[1].count).toBe(52);
  });

  it('不依赖 event_log（groupBy 未被调用）', async () => {
    const { service, prisma } = makeService({ started: 1, submitted: 1, reportGenerated: 1 });
    await service.funnel();
    expect(prisma.eventLog.groupBy).not.toHaveBeenCalled();
  });

  it('异常时降级 source=mock 且三步计数归零（序不变）', async () => {
    const prisma: any = {
      $transaction: jest.fn(async () => { throw new Error('db down'); }),
      assessmentRecord: { count: jest.fn() },
      report: { count: jest.fn() },
    };
    const clickhouse: any = { ping: jest.fn(async () => false) };
    const service = new AdminAnalyticsService(prisma, clickhouse);

    const res: any = await service.funnel(7);
    expect(res.source).toBe('mock');
    expect(res.days).toBe(7);
    expect(res.funnel).toEqual([
      { step: 'assessment_start', count: 0 },
      { step: 'assessment_submit', count: 0 },
      { step: 'report_generate', count: 0 },
    ]);
  });
});

describe('AdminAnalyticsService.overview（营收字段已移除）', () => {
  it('返回新字段且不含 paidUsers/payRate/paidOrders/gmvCents，aiCallCount 为四项计', async () => {
    // 顺序：totalUsers,newUsers7d,assessmentCount,reportCount,careerPlan,resume,interview,aiChat
    const prisma: any = {
      $transaction: jest.fn(async () => [1000, 50, 800, 400, 30, 20, 10, 200]),
      user: { count: jest.fn() },
      assessmentRecord: { count: jest.fn() },
      report: { count: jest.fn() },
      careerGrowthPlan: { count: jest.fn() },
      aiResumeDoc: { count: jest.fn() },
      aiInterview: { count: jest.fn() },
      aiMessage: { count: jest.fn() },
    };
    const clickhouse: any = { ping: jest.fn(async () => false) };
    const service = new AdminAnalyticsService(prisma, clickhouse);
    const res: any = await service.overview();

    expect(res).toEqual({
      source: 'mysql',
      totalUsers: 1000,
      newUsers7d: 50,
      assessmentCount: 800,
      reportCount: 400,
      aiCallCount: 30 + 20 + 10 + 200,
    });
    expect(res).not.toHaveProperty('paidUsers');
    expect(res).not.toHaveProperty('payRate');
    expect(res).not.toHaveProperty('paidOrders');
    expect(res).not.toHaveProperty('gmvCents');
  });
});

describe('AdminAnalyticsService.moduleUsage', () => {
  const makeService = (counts: Record<string, number>) => {
    const mk = (v: number) => ({ count: jest.fn(async () => v) });
    const prisma: any = {
      assessmentRecord: mk(counts.assessment ?? 0),
      report: mk(counts.report ?? 0),
      careerGrowthPlan: mk(counts.careerPlan ?? 0),
      aiResumeDoc: mk(counts.resume ?? 0),
      aiInterview: mk(counts.interview ?? 0),
      aiInterviewQa: mk(counts.interviewBank ?? 0),
      aiMessage: mk(counts.aiChat ?? 0),
      coachingOrder: mk(counts.coaching ?? 0),
      dailyBrief: mk(counts.dailyBrief ?? 0),
    };
    const clickhouse: any = { ping: jest.fn(async () => false) };
    return new AdminAnalyticsService(prisma, clickhouse);
  };

  it('items 按 count 降序，ratio 保留 4 位且合计口径正确', async () => {
    const service = makeService({ assessment: 60, report: 30, aiChat: 10 });
    const res: any = await service.moduleUsage(30);
    expect(res.source).toBe('mysql');
    expect(res.days).toBe(30);
    expect(res.total).toBe(100);
    // 降序
    const counts = res.items.map((i: any) => i.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    const assess = res.items.find((i: any) => i.moduleKey === 'assessment');
    expect(assess.count).toBe(60);
    expect(assess.ratio).toBe(0.6);
    expect(res.items.length).toBe(9);
  });

  it('total=0 时 ratio 全为 0', async () => {
    const service = makeService({});
    const res: any = await service.moduleUsage();
    expect(res.total).toBe(0);
    expect(res.items.every((i: any) => i.ratio === 0)).toBe(true);
  });
});

describe('AdminAnalyticsService.moduleTrend', () => {
  const makeService = () => {
    const empty = { findMany: jest.fn(async () => []) };
    const prisma: any = {
      assessmentRecord: empty,
      report: empty,
      careerGrowthPlan: empty,
      aiResumeDoc: empty,
      aiInterview: empty,
      aiInterviewQa: empty,
      aiMessage: empty,
      coachingOrder: empty,
      dailyBrief: empty,
    };
    const clickhouse: any = { ping: jest.fn(async () => false) };
    return new AdminAnalyticsService(prisma, clickhouse);
  };

  it('缺省返回全部模块分组、date 连续且缺口补 0', async () => {
    const service = makeService();
    const res: any = await service.moduleTrend(3);
    expect(res.source).toBe('mysql');
    expect(res.series.length).toBe(3);
    // 每行含全部 9 个模块键且均为 0
    const row = res.series[0];
    expect(Object.keys(row)).toContain('assessment');
    expect(row.aiChat).toBe(0);
    expect(/^\d{4}-\d{2}-\d{2}$/.test(row.date)).toBe(true);
  });

  it('传入 moduleKey 时仅该模块分组', async () => {
    const service = makeService();
    const res: any = await service.moduleTrend(5, 'assessment');
    expect(res.series.length).toBe(5);
    const keys = Object.keys(res.series[0]);
    expect(keys).toEqual(['date', 'assessment']);
  });
});