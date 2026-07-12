import { AiResumeService } from './ai-resume.service';
import { BizCode, BizException } from '../../common/response';

/**
 * §3.2 AiResumeService 单测（纯内存 mock，无真实 DB/网络）。
 * 覆盖：会员校验(4515)、敏感词(4516)、职业不存在(4004)、正常流、LLM 降级。
 */
describe('AiResumeService (§3.2 简历生成)', () => {
  const USER = '1001';
  const memberUser = { membershipLevel: 1, membershipExpireAt: null, paidExpireAt: null, isPaid: 0 };
  const career = { id: 5n, name: '产品经理', category: '互联网' };

  const goodJson = JSON.stringify({
    content: '一份完整的简历初稿',
    sections: [{ title: '求职意向', body: '目标：产品经理' }],
  });

  const makePrisma = (opts?: { user?: any; career?: any }) =>
    ({
      user: { findFirst: jest.fn(async () => opts?.user ?? memberUser) },
      career: { findFirst: jest.fn(async () => (opts && 'career' in opts ? opts.career : career)) },
      aiResumeDoc: { create: jest.fn(async () => ({ id: 88n })) },
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
    careerId: '5',
    profile: {
      education: '本科·计算机',
      experiences: [{ role: '产品助理', description: '负责需求梳理' }],
      skills: ['沟通', 'SQL'],
    },
    type: 'resume',
  };

  it('正常流：解析 LLM，degraded=false，落库返回 docId', async () => {
    const prisma = makePrisma();
    const svc = new AiResumeService(prisma, makeLlm());
    const vo = await svc.generate(USER, dto as any);
    expect(vo.degraded).toBe(false);
    expect(vo.docId).toBe('88');
    expect(vo.sections[0].title).toBe('求职意向');
    expect(prisma.aiResumeDoc.create).toHaveBeenCalled();
  });

  it('非会员：抛 AI_MEMBER_ONLY(4515)', async () => {
    const prisma = makePrisma({ user: { membershipLevel: 0, membershipExpireAt: null, paidExpireAt: null, isPaid: 0 } });
    const svc = new AiResumeService(prisma, makeLlm());
    await expect(svc.generate(USER, dto as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_MEMBER_ONLY,
    } as Partial<BizException>);
  });

  it('敏感词：抛 AI_SENSITIVE_CONTENT(4516)，且不调 LLM', async () => {
    const prisma = makePrisma();
    const llm = makeLlm();
    const svc = new AiResumeService(prisma, llm);
    const badDto = { ...dto, profile: { ...dto.profile, education: '涉及赌博的经历' } };
    await expect(svc.generate(USER, badDto as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_SENSITIVE_CONTENT,
    } as Partial<BizException>);
    expect(llm.chat).not.toHaveBeenCalled();
  });

  it('职业不存在：抛 AI_NOT_FOUND(4004)', async () => {
    const prisma = makePrisma({ career: null });
    const svc = new AiResumeService(prisma, makeLlm());
    await expect(svc.generate(USER, dto as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_NOT_FOUND,
    } as Partial<BizException>);
  });

  it('LLM degraded=true：回退规则版，degraded=true 且 sections 非空', async () => {
    const prisma = makePrisma();
    const svc = new AiResumeService(prisma, makeLlm({ degraded: true }));
    const vo = await svc.generate(USER, dto as any);
    expect(vo.degraded).toBe(true);
    expect(vo.sections.length).toBeGreaterThan(0);
  });
});