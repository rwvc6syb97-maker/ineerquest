import { AiInterviewService, INTERVIEW_MAX_ROUNDS } from './ai-interview.service';
import { BizCode, BizException } from '../../common/response';

/**
 * §4.1 AiInterviewService 单测（纯内存 mock）。
 * 覆盖：会员校验(4515)、越权(4003)、已结束再答(4520)、正常评分出下一题、末轮结束汇总。
 */
describe('AiInterviewService (§4.1 AI 模拟面试)', () => {
  const USER = '1001';
  const memberUser = { membershipLevel: 1, membershipExpireAt: null, paidExpireAt: null, isPaid: 0 };

  const makeLlm = () =>
    ({
      chat: jest.fn(async () => ({
        text: JSON.stringify({ score: 82, feedback: '答得不错' }),
        provider: 'mock',
        model: 'm',
        degraded: false,
      })),
    }) as any;

  const makePrisma = (opts?: { user?: any; interview?: any; currentQa?: any }) =>
    ({
      user: { findFirst: jest.fn(async () => opts?.user ?? memberUser) },
      career: { findFirst: jest.fn(async () => ({ id: 5n, name: '产品经理', category: '互联网' })) },
      aiInterview: {
        findFirst: jest.fn(async () => opts?.interview ?? null),
        create: jest.fn(async () => ({ id: 10n })),
        update: jest.fn(async () => ({})),
      },
      aiInterviewQa: {
        findFirst: jest.fn(async () => opts?.currentQa ?? null),
        findMany: jest.fn(async () => [{ score: 80 }, { question: 'q1' }]),
        create: jest.fn(async () => ({ id: 100n })),
        update: jest.fn(async () => ({})),
      },
    }) as any;

  it('非会员：start 抛 AI_MEMBER_ONLY(4515)', async () => {
    const prisma = makePrisma({
      user: { membershipLevel: 0, membershipExpireAt: null, paidExpireAt: null, isPaid: 0 },
    });
    const svc = new AiInterviewService(prisma, makeLlm());
    await expect(svc.start(USER, { careerId: '5' } as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_MEMBER_ONLY,
    } as Partial<BizException>);
  });

  it('answer 越权他人会话 → 4003', async () => {
    const prisma = makePrisma({ interview: { id: 10n, userId: 9999n, status: 0, careerId: 5n, difficulty: 'medium' } });
    const svc = new AiInterviewService(prisma, makeLlm());
    await expect(svc.answer(USER, '10', { answer: 'hi' } as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_FORBIDDEN,
    });
  });

  it('answer 会话已结束(status=1) → 4520', async () => {
    const prisma = makePrisma({ interview: { id: 10n, userId: BigInt(USER), status: 1, careerId: 5n, difficulty: 'medium' } });
    const svc = new AiInterviewService(prisma, makeLlm());
    await expect(svc.answer(USER, '10', { answer: 'hi' } as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_INTERVIEW_FINISHED,
    });
  });

  it('answer 为空 → 4005', async () => {
    const prisma = makePrisma({ interview: { id: 10n, userId: BigInt(USER), status: 0, careerId: 5n, difficulty: 'medium' } });
    const svc = new AiInterviewService(prisma, makeLlm());
    await expect(svc.answer(USER, '10', { answer: '' } as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_BAD_PARAM,
    });
  });

  it('正常答题（非末轮）：评分并出下一题，finished=false', async () => {
    const prisma = makePrisma({
      interview: { id: 10n, userId: BigInt(USER), status: 0, careerId: 5n, difficulty: 'medium' },
      currentQa: { id: 100n, seq: 1, question: 'q1' },
    });
    const svc = new AiInterviewService(prisma, makeLlm());
    const vo = await svc.answer(USER, '10', { answer: '我的回答' } as any);
    expect(vo.score).toBe(82);
    expect(vo.finished).toBe(false);
    expect(vo.nextQuestion).toBeTruthy();
    expect(prisma.aiInterviewQa.create).toHaveBeenCalled();
  });

  it('末轮答题（seq=MAX）：finished=true 且汇总报告，会话置结束', async () => {
    const prisma = makePrisma({
      interview: { id: 10n, userId: BigInt(USER), status: 0, careerId: 5n, difficulty: 'medium' },
      currentQa: { id: 100n, seq: INTERVIEW_MAX_ROUNDS, question: 'qLast' },
    });
    const svc = new AiInterviewService(prisma, makeLlm());
    const vo = await svc.answer(USER, '10', { answer: '最终回答' } as any);
    expect(vo.finished).toBe(true);
    expect(prisma.aiInterview.update).toHaveBeenCalled();
  });
});