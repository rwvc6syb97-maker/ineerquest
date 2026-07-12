import { AiCollabService } from './ai-collab.service';
import { BizCode, BizException } from '../../common/response';

/**
 * §3.1 AiCollabService 单测（纯内存 mock，无真实 DB/Redis/网络）。
 * 覆盖：正常流、游客试用超限(9001)、登录日配额耗尽(9002)、游客不落库、save 落库、LLM 降级。
 */
describe('AiCollabService (§3.1 协作分析)', () => {
  const USER = '1001';
  const IP = '1.2.3.4';

  const goodJson = JSON.stringify({
    summary: '整体协作良好',
    pairs: [{ a: 'A', b: 'B', synergy: 80, advice: '多沟通' }],
    risks: ['节奏不一致'],
  });

  const makeRedis = (count = 1) =>
    ({
      raw: {
        incr: jest.fn(async () => count),
        expire: jest.fn(async () => 1),
      },
    }) as any;

  const makePrisma = () =>
    ({
      aiCollabAnalysis: { create: jest.fn(async () => ({ id: 77n })) },
    }) as any;

  const makeLlm = (opts?: { text?: string; degraded?: boolean }) =>
    ({
      chat: jest.fn(async () => ({
        text: opts?.text ?? goodJson,
        provider: 'mock',
        model: 'm',
        degraded: opts?.degraded ?? false,
      })),
    }) as any;

  const dto = {
    members: [
      { name: '小A', mbtiType: 'INTJ' },
      { name: '小B', mbtiType: 'ENFP' },
    ],
    scene: '项目协作',
    save: false,
  };

  it('登录用户正常流：解析 LLM，degraded=false，save=false 不落库', async () => {
    const prisma = makePrisma();
    const svc = new AiCollabService(prisma, makeRedis(1), makeLlm());
    const vo = await svc.analyze(USER, IP, dto as any);
    expect(vo.degraded).toBe(false);
    expect(vo.summary).toBe('整体协作良好');
    expect(vo.pairs[0].synergy).toBe(80);
    expect(vo.analysisId).toBeUndefined();
    expect(prisma.aiCollabAnalysis.create).not.toHaveBeenCalled();
  });

  it('登录用户 save=true：落库并返回 analysisId', async () => {
    const prisma = makePrisma();
    const svc = new AiCollabService(prisma, makeRedis(1), makeLlm());
    const vo = await svc.analyze(USER, IP, { ...dto, save: true } as any);
    expect(vo.analysisId).toBe('77');
    expect(prisma.aiCollabAnalysis.create).toHaveBeenCalled();
  });

  it('游客正常流：不落库，即使 save=true', async () => {
    const prisma = makePrisma();
    const svc = new AiCollabService(prisma, makeRedis(1), makeLlm());
    const vo = await svc.analyze(undefined, IP, { ...dto, save: true } as any);
    expect(vo.analysisId).toBeUndefined();
    expect(prisma.aiCollabAnalysis.create).not.toHaveBeenCalled();
  });

  it('游客试用超限：抛 RATE_LIMITED(9001)', async () => {
    const svc = new AiCollabService(makePrisma(), makeRedis(2), makeLlm());
    await expect(svc.analyze(undefined, IP, dto as any)).rejects.toMatchObject({
      bizCode: BizCode.RATE_LIMITED,
    } as Partial<BizException>);
  });

  it('登录用户日配额耗尽：抛 AI_USER_QUOTA_EXHAUSTED(9002)', async () => {
    const svc = new AiCollabService(makePrisma(), makeRedis(21), makeLlm());
    await expect(svc.analyze(USER, IP, dto as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_USER_QUOTA_EXHAUSTED,
    } as Partial<BizException>);
  });

  it('LLM degraded=true：回退规则版，degraded=true 且 pairs 非空', async () => {
    const svc = new AiCollabService(makePrisma(), makeRedis(1), makeLlm({ degraded: true }));
    const vo = await svc.analyze(USER, IP, dto as any);
    expect(vo.degraded).toBe(true);
    expect(vo.pairs.length).toBeGreaterThan(0);
  });
});