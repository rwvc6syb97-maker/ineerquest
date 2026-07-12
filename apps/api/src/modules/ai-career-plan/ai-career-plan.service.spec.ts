import { AiCareerPlanService } from './ai-career-plan.service';
import { BizCode, BizException } from '../../common/response';

/**
 * §2.1 AiCareerPlanService 单测（纯内存 mock，无真实 DB/网络）。
 * 覆盖：会员校验(4515)、职业不存在(4004)、正常流、LLM 解析失败→降级、LLM degraded→降级。
 */
describe('AiCareerPlanService (§2.1 动态成长计划)', () => {
  const USER = '1001';
  const memberUser = { membershipLevel: 1, membershipExpireAt: null, paidExpireAt: null, isPaid: 0 };
  const career = { id: 5n, name: '产品经理', category: '互联网', description: '' };

  const makePrisma = (opts?: { user?: any; career?: any }) =>
    ({
      user: { findFirst: jest.fn(async () => opts?.user ?? memberUser) },
      career: { findFirst: jest.fn(async () => (opts && 'career' in opts ? opts.career : career)) },
      careerGrowthPlan: { create: jest.fn(async () => ({ id: 99n })) },
    }) as any;

  const goodJson = JSON.stringify({
    weeks: [{ weekNo: 1, theme: '入门', tasks: [{ title: '了解岗位' }] }],
  });

  const makeLlm = (opts?: { text?: string; degraded?: boolean }) =>
    ({
      chat: jest.fn(async () => ({
        text: opts?.text ?? goodJson,
        provider: 'mock',
        model: 'm',
        degraded: opts?.degraded ?? false,
        degradeReason: undefined,
      })),
    }) as any;

  const dto = { careerId: '5', targetMonths: 3, currentSkills: ['沟通'] };

  it('正常流：解析 LLM JSON，degraded=false，落库并返回 planId', async () => {
    const prisma = makePrisma();
    const svc = new AiCareerPlanService(prisma, makeLlm());
    const vo = await svc.generate(USER, dto as any);
    expect(vo.degraded).toBe(false);
    expect(vo.planId).toBe('99');
    expect(vo.weeks[0].theme).toBe('入门');
    expect(prisma.careerGrowthPlan.create).toHaveBeenCalled();
  });

  it('非会员：抛 AI_MEMBER_ONLY(4515)', async () => {
    const prisma = makePrisma({ user: { membershipLevel: 0, membershipExpireAt: null, paidExpireAt: null, isPaid: 0 } });
    const svc = new AiCareerPlanService(prisma, makeLlm());
    await expect(svc.generate(USER, dto as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_MEMBER_ONLY,
    } as Partial<BizException>);
  });

  it('职业不存在：抛 AI_NOT_FOUND(4004)', async () => {
    const prisma = makePrisma({ career: null });
    const svc = new AiCareerPlanService(prisma, makeLlm());
    await expect(svc.generate(USER, dto as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_NOT_FOUND,
    } as Partial<BizException>);
  });

  it('LLM degraded=true：回退规则版，degraded=true', async () => {
    const prisma = makePrisma();
    const svc = new AiCareerPlanService(prisma, makeLlm({ degraded: true }));
    const vo = await svc.generate(USER, dto as any);
    expect(vo.degraded).toBe(true);
    expect(vo.weeks.length).toBeGreaterThan(0);
  });

  it('LLM 返回非法 JSON：解析失败回退规则版，degraded=true', async () => {
    const prisma = makePrisma();
    const svc = new AiCareerPlanService(prisma, makeLlm({ text: '这不是JSON' }));
    const vo = await svc.generate(USER, dto as any);
    expect(vo.degraded).toBe(true);
    expect(vo.weeks.length).toBeGreaterThan(0);
  });
});