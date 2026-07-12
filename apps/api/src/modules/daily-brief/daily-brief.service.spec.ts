import { DailyBriefService } from './daily-brief.service';
import { BizCode } from '../../common/response';

/**
 * §4.3 DailyBriefService 单测（纯内存 mock，无真实 DB）。
 * 覆盖：当日无已发布日报 → 4004、getMine 仅读 status=1、
 *      订阅 upsert 幂等（一人一条 uk_user_id）、resolveDate/fmtDate UTC 零点。
 */
describe('DailyBriefService (§4.3 职业热点日报)', () => {
  const USER = '5001';

  const makePrisma = (opts?: { brief?: any; sub?: any }) => {
    const upsert = jest.fn(async () => opts?.sub ?? { enabled: 1, categoriesData: ['互联网'] });
    const briefFindFirst = jest.fn(async () => opts?.brief ?? null);
    const prisma: any = {
      dailyBrief: { findFirst: briefFindFirst },
      dailyBriefSubscription: { upsert },
    };
    prisma._upsert = upsert;
    prisma._briefFindFirst = briefFindFirst;
    return prisma;
  };

  it('getMine：当日无已发布日报 → 4004', async () => {
    const prisma = makePrisma({ brief: null });
    const svc = new DailyBriefService(prisma);
    await expect(svc.getMine(USER, {} as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_NOT_FOUND,
    });
  });

  it('getMine：仅读 status=1 的当前用户日报，date 解析为 UTC 零点', async () => {
    const prisma = makePrisma({
      brief: {
      id: 88n,
        briefDate: new Date('2026-07-12T00:00:00.000Z'),
        itemsData: [{ title: 'T', summary: 'S', careerId: 3 }],
      },
    });
    const svc = new DailyBriefService(prisma);
    const res = await svc.getMine(USER, { date: '2026-07-12' } as any);

    expect(res.briefId).toBe('88');
    expect(res.date).toBe('2026-07-12');
    expect(res.items).toEqual([{ title: 'T', summary: 'S', careerId: '3' }]);

    const whereArg = prisma._briefFindFirst.mock.calls[0][0];
    expect(whereArg.where).toMatchObject({ userId: BigInt(USER), status: 1 });
    expect((whereArg.where.briefDate as Date).toISOString()).toBe('2026-07-12T00:00:00.000Z');
  });

  it('updateSubscription：upsert 幂等（where userId 唯一），开启订阅', async () => {
    const prisma = makePrisma({ sub: { enabled: 1, categoriesData: ['互联网', '金融'] } });
    const svc = new DailyBriefService(prisma);
    const res = await svc.updateSubscription(USER, {
      enabled: true,
      categories: ['互联网', '金融'],
    } as any);

    expect(res.enabled).toBe(true);
    expect(res.categories).toEqual(['互联网', '金融']);

    const arg = prisma._upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: BigInt(USER) });
    expect(arg.create).toMatchObject({ userId: BigInt(USER), enabled: 1 });
    expect(arg.update).toMatchObject({ enabled: 1 });
  });

  it('updateSubscription：关闭订阅 enabled=0，空品类归一为 []', async () => {
    const prisma = makePrisma({ sub: { enabled: 0, categoriesData: [] } });
    const svc = new DailyBriefService(prisma);
    const res = await svc.updateSubscription(USER, {
      enabled: false,
      categories: [],
    } as any);

    expect(res.enabled).toBe(false);
    expect(res.categories).toEqual([]);
    const arg = prisma._upsert.mock.calls[0][0];
    expect(arg.create.enabled).toBe(0);
  });

  it('getMine：缺省 date 时按今日 UTC 零点查询', async () => {
    const prisma = makePrisma({ brief: null });
    const svc = new DailyBriefService(prisma);
    await expect(svc.getMine(USER, {} as any)).rejects.toBeDefined();

    const whereArg = prisma._briefFindFirst.mock.calls[0][0];
    const d = whereArg.where.briefDate as Date;
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
  });
});