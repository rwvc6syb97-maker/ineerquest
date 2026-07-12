import { CareerAiService } from './career-ai.service';
import { BizCode, BizException } from '../../common/response';

/**
 * §4.4 CareerAiService 单测（纯内存 mock，无真实 DB/网络）。
 * 覆盖：S-05 招聘源拒绝(4005)、重复职业名(4461)、S-04 生成仅入草稿表、
 *      approve 事务同步 career/career_skill、reject 仅置状态、4460/4462、LLM 降级。
 */
describe('CareerAiService (§4.4 职业库生产)', () => {
  const ADMIN = '9001';

  const goodJson = JSON.stringify({
    description: '负责数据分析',
    responsibility: '清洗、建模、洞察',
    salaryMin: 12000,
    salaryMax: 30000,
    prospect: '前景好',
    suitTypes: 'INTJ',
    skills: [{ skillName: 'SQL', skillType: 1, requireLevel: 4, weight: 1.5 }],
  });

  const makeLlm = (opts?: { text?: string; degraded?: boolean }) =>
    ({
      chat: jest.fn(async () => ({
        text: opts?.text ?? goodJson,
        provider: 'mock',
        model: 'm',
        degraded: opts?.degraded ?? false,
      })),
    }) as any;

  const makePrisma = (opts?: { dupCareer?: any; dupDraft?: any; draft?: any }) => {
    const careerCreate = jest.fn(async () => ({ id: 777n }));
    const skillCreate = jest.fn(async () => ({ id: 1n }));
    const draftUpdate = jest.fn(async () => ({}));
    const prisma: any = {
      career: {
        findFirst: jest.fn(async () => opts?.dupCareer ?? null),
        findUnique: jest.fn(async () => null),
        create: careerCreate,
      },
      careerSkill: { create: skillCreate },
      careerAiDraft: {
        findFirst: jest.fn(async () => opts?.dupDraft ?? null),
        findUnique: jest.fn(async () => opts?.draft ?? null),
        create: jest.fn(async () => ({ id: 55n })),
        update: draftUpdate,
        count: jest.fn(async () => 0),
        findMany: jest.fn(async () => []),
      },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    prisma._careerCreate = careerCreate;
    prisma._skillCreate = skillCreate;
    prisma._draftUpdate = draftUpdate;
    return prisma;
  };

  const genDto = { name: '数据分析师', category: '数据科学' };

  it('S-05 红线：refSources 命中招聘平台 → 4005，且不调 LLM/不落库', async () => {
    const prisma = makePrisma();
    const llm = makeLlm();
    const svc = new CareerAiService(prisma, llm);
    const dto = { ...genDto, refSources: ['https://www.zhipin.com/job/123'] };
    await expect(svc.generate(ADMIN, dto as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_BAD_PARAM,
    } as Partial<BizException>);
    expect(llm.chat).not.toHaveBeenCalled();
    expect(prisma.careerAiDraft.create).not.toHaveBeenCalled();
  });

  it('name/category 为空 → 4005', async () => {
    const svc = new CareerAiService(makePrisma(), makeLlm());
    await expect(svc.generate(ADMIN, { name: '', category: 'x' } as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_BAD_PARAM,
    });
  });

  it('重复职业名（正式库已存在）→ 4461', async () => {
    const prisma = makePrisma({ dupCareer: { id: 1n } });
    const svc = new CareerAiService(prisma, makeLlm());
    await expect(svc.generate(ADMIN, genDto as any)).rejects.toMatchObject({
      bizCode: BizCode.CAREER_DRAFT_DUPLICATE_NAME,
    });
  });

it('S-04：generate 仅入 career_ai_draft，不写 career/career_skill', async () => {
    const prisma = makePrisma();
    const svc = new CareerAiService(prisma, makeLlm());
    const vo = await svc.generate(ADMIN, genDto as any);
    expect(vo.draftId).toBe('55');
    expect(prisma.careerAiDraft.create).toHaveBeenCalled();
    expect(prisma._careerCreate).not.toHaveBeenCalled();
    expect(prisma._skillCreate).not.toHaveBeenCalled();
  });

  it('LLM degraded=true：仍落草稿，skills 有兜底', async () => {
    const prisma = makePrisma();
    const svc = new CareerAiService(prisma, makeLlm({ degraded: true }));
    const vo = await svc.generate(ADMIN, genDto as any);
    expect(vo.skills.length).toBeGreaterThan(0);
  });

  it('review 草稿不存在 → 4460', async () => {
    const prisma = makePrisma({ draft: null });
    const svc = new CareerAiService(prisma, makeLlm());
    await expect(svc.review('123', { action: 'approve' } as any)).rejects.toMatchObject({
      bizCode: BizCode.CAREER_DRAFT_NOT_FOUND,
    });
  });

  it('review 已审核（status=1）→ 4462', async () => {
    const prisma = makePrisma({ draft: { id: 55n, status: 1, name: 'x', category: 'y', draftData: {}, skillsData: [] } });
    const svc = new CareerAiService(prisma, makeLlm());
    await expect(svc.review('55', { action: 'approve' } as any)).rejects.toMatchObject({
      bizCode: BizCode.CAREER_DRAFT_ALREADY_REVIEWED,
    });
  });

  it('approve：事务同步 career + career_skill，回写 syncedCareerId', async () => {
    const prisma = makePrisma({
      draft: {
        id: 55n,
        status: 0,
        name: '数据分析师',
        category: '数据科学',
        draftData: { description: 'd', salaryMin: 1, salaryMax: 2 },
        skillsData: [{ skillName: 'SQL', requireLevel: 4 }],
      },
    });
    const svc = new CareerAiService(prisma, makeLlm());
    const vo = await svc.review('55', { action: 'approve' } as any);
    expect(vo.status).toBe(1);
    expect(vo.syncedCareerId).toBe('777');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma._careerCreate).toHaveBeenCalled();
    expect(prisma._skillCreate).toHaveBeenCalled();
    expect(prisma._draftUpdate).toHaveBeenCalled();
  });

  it('reject：仅置 status=2，不写正式表', async () => {
    const prisma = makePrisma({
      draft: { id: 55n, status: 0, name: 'x', category: 'y', draftData: {}, skillsData: [] },
    });
    const svc = new CareerAiService(prisma, makeLlm());
    const vo = await svc.review('55', { action: 'reject', remark: '资料不足' } as any);
    expect(vo.status).toBe(2);
    expect(prisma._careerCreate).not.toHaveBeenCalled();
    expect(prisma._skillCreate).not.toHaveBeenCalled();
  });
});