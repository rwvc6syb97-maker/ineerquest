import { InterviewBankService } from './interview-bank.service';
import { BizCode } from '../../common/response';

/**
 * §4.2 InterviewBankService 单测（纯内存 mock，无真实 DB/网络）。
 * 覆盖：列表仅已发布题过滤 + 分页封顶、非会员评分 4515、题不存在 4004、
 *      answer 空 4005、LLM 正常解析、LLM 降级兜底。
 */
describe('InterviewBankService (§4.2 面试题库/评分)', () => {
  const USER = '3001';

  const makeLlm = (opts?: { text?: string; degraded?: boolean }) =>
    ({
      chat: jest.fn(async () => ({
        text: opts?.text ?? JSON.stringify({ score: 88, feedback: '答得不错' }),
        provider: 'mock',
        model: 'm',
        degraded: opts?.degraded ?? false,
      })),
    }) as any;

  const memberUser = {
    membershipLevel: 1,
    membershipExpireAt: null,
    paidExpireAt: null,
    isPaid: 0,
  };
  const nonMemberUser = {
    membershipLevel: 0,
    membershipExpireAt: null,
    paidExpireAt: null,
    isPaid: 0,
  };

  const makePrisma = (opts?: { user?: any; question?: any; rows?: any[]; total?: number }) => {
    const findMany = jest.fn(async () => opts?.rows ?? []);
    const count = jest.fn(async () => opts?.total ?? 0);
    const prisma: any = {
      user: { findFirst: jest.fn(async () => opts?.user ?? memberUser) },
      interviewQuestion: {
        findMany,
        count,
        findFirst: jest.fn(async () => opts?.question ?? null),
      },
    };
    prisma._findMany = findMany;
    prisma._count = count;
    return prisma;
  };

  it('list：仅返回已发布题（status=1 & isDeleted=0），pageSize 封顶 50', async () => {
    const prisma = makePrisma({
      rows: [{ id: 10n, question: 'Q1', tagsData: ['js'] }],
      total: 1,
    });
    const svc = new InterviewBankService(prisma, makeLlm());
    const res = await svc.list({ careerId: '1', pageSize: 999 } as any);

    expect(res.total).toBe(1);
    expect(res.list[0]).toEqual({ qId: '10', question: 'Q1', tags: ['js'] });
    const whereArg = prisma._findMany.mock.calls[0][0];
    expect(whereArg.where).toMatchObject({ careerId: 1n, status: 1, isDeleted: 0 });
    expect(whereArg.take).toBe(50); // 封顶
  });

  it('list：careerId 非法 → 4005', async () => {
    const svc = new InterviewBankService(makePrisma(), makeLlm());
    await expect(svc.list({ careerId: 'abc' } as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_BAD_PARAM,
    });
  });

  it('score：非会员 → 4515，不查询题目', async () => {
    const prisma = makePrisma({ user: nonMemberUser });
    const svc = new InterviewBankService(prisma, makeLlm());
    await expect(svc.score(USER, '10', { answer: 'x' } as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_MEMBER_ONLY,
    });
    expect(prisma.interviewQuestion.findFirst).not.toHaveBeenCalled();
  });

  it('score：answer 空 → 4005', async () => {
    const svc = new InterviewBankService(makePrisma(), makeLlm());
    await expect(svc.score(USER, '10', { answer: '   ' } as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_BAD_PARAM,
    });
  });

  it('score：题目不存在/未发布 → 4004', async () => {
    const prisma = makePrisma({ question: null });
    const svc = new InterviewBankService(prisma, makeLlm());
    await expect(svc.score(USER, '10', { answer: '我的作答' } as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_NOT_FOUND,
    });
  });

  it('score：LLM 正常解析 JSON → 返回评分与参考答案', async () => {
    const prisma = makePrisma({
      question: { question: 'Q', difficulty: 'easy', sampleAnswer: '范例' },
    });
    const svc = new InterviewBankService(prisma, makeLlm());
    const res = await svc.score(USER, '10', { answer: '我的作答' } as any);
    expect(res.score).toBe(88);
    expect(res.feedback).toBe('答得不错');
    expect(res.sampleAnswer).toBe('范例');
  });

  it('score：LLM 降级 → 兜底评分（不抛错）', async () => {
    const prisma = makePrisma({
      question: { question: 'Q', difficulty: 'easy', sampleAnswer: '' },
    });
    const svc = new InterviewBankService(prisma, makeLlm({ degraded: true }));
    const res = await svc.score(USER, '10', { answer: '我的作答' } as any);
    expect(res.score).toBe(60);
    expect(res.sampleAnswer).toBe('');
    expect(typeof res.feedback).toBe('string');
  });
});