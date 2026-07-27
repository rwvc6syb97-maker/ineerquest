import { AdminAnalyticsService } from './admin-analytics.service';

/**
 * funnel 四步权威源口径单测（缺陷整改）：
 * 全漏斗弃用 event_log，改走 assessment_record / report 权威业务表；
 * 与首页 stats / assessmentRate 口径自洽，四步顺序不变。
 */
describe('AdminAnalyticsService.funnel', () => {
  const makeService = (opts: {
    started: number;
    submitted: number;
    reportGenerated: number;
    reportUnlocked: number;
  }) => {
    // $transaction([...]) 按数组顺序返回：started, submitted, reportGenerated, reportUnlocked
    const prisma: any = {
      $transaction: jest.fn(async () => [
        opts.started,
        opts.submitted,
        opts.reportGenerated,
        opts.reportUnlocked,
      ]),
      assessmentRecord: { count: jest.fn() },
      report: { count: jest.fn() },
      // 不应再触碰 event_log
      eventLog: { groupBy: jest.fn(async () => { throw new Error('event_log 不应被 funnel 使用'); }) },
    };
    const clickhouse: any = { ping: jest.fn(async () => false) };
    return { service: new AdminAnalyticsService(prisma, clickhouse), prisma };
 };

  it('四步取权威业务表计数、顺序与 source 正确', async () => {
    const { service } = makeService({
      started: 100,
      submitted: 60,
      reportGenerated: 40,
      reportUnlocked: 15,
    });
    const res: any = await service.funnel(30);

    expect(res.source).toBe('assessment_record');
    expect(res.days).toBe(30);
    expect(res.funnel).toEqual([
      { step: 'assessment_start', count: 100 },
      { step: 'assessment_submit', count: 60 },
      { step: 'report_generate', count: 40 },
      { step: 'report_unlock', count: 15 },
    ]);
  });

  it('步骤1/2 与 assessmentRate started/submitted 口径自洽', async () => {
    const started = 88;
    const submitted = 52;
    const { service } = makeService({ started, submitted, reportGenerated: 30, reportUnlocked: 9 });
    const res: any = await service.funnel();
    expect(res.funnel[0].count).toBe(started); // = assessmentRate.started
    expect(res.funnel[1].count).toBe(submitted); // = submitted = 首页 completedCount
  });

  it('不依赖 event_log（groupBy 未被调用）', async () => {
    const { service, prisma } = makeService({
      started: 1,
      submitted: 1,
      reportGenerated: 1,
      reportUnlocked: 1,
    });
    await service.funnel();
    expect(prisma.eventLog.groupBy).not.toHaveBeenCalled();
  });

  it('异常时降级 source=mock 且四步计数归零（序不变）', async () => {
    const prisma: any = {
      $transaction: jest.fn(async () => { throw new Error('db down'); }),
      assessmentRecord: { count: jest.fn() },
      report: { count: jest.fn() },
      eventLog: { groupBy: jest.fn() },
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
      { step: 'report_unlock', count: 0 },
    ]);
  });
});