// pdf-parse mock：受测代码用 `import pdfParse = require('pdf-parse')`，此处按当前用例期望的文本返回。
let __pdfText = '这是一段用于测试的简历正文，包含足够的字符以通过最小长度校验。产品经理 需求分析 SQL 项目管理经验。';
jest.mock('pdf-parse', () => jest.fn(async () => ({ text: __pdfText })));

import { AiResumeService } from './ai-resume.service';
import { BizCode, BizException } from '../../common/response';

/**
 * §3.2 AiResumeService 单测（纯内存 mock，无真实 DB/网络）。
 * 覆盖：会员校验(免费化放行)、敏感词(4516)、职业不存在(4004)、正常流、LLM 降级。
 */
describe('AiResumeService (§3.2 简历生成)', () => {
  const USER = '1001';
  const memberUser = {};
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

  it('免费化：非会员用户直接放行，正常落库返回 docId', async () => {
    const prisma = makePrisma({ user: {} });
    const svc = new AiResumeService(prisma, makeLlm());
    const vo = await svc.generate(USER, dto as any);
    expect(vo.degraded).toBe(false);
    expect(vo.docId).toBe('88');
    expect(prisma.aiResumeDoc.create).toHaveBeenCalled();
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

/**
 * §6 M4 简历上传优化单测（纯内存 mock，无真实 DB/PDF/网络）。
 * 覆盖：校验次序各错误码(4620/4621/4622/4624/4623/4625/4516)、幂等(4090)、配额(4501)、
 *       正常流+degraded 兜底、getOptimizeDoc 越权(4003)/不存在(4004)。
 */
describe('AiResumeService (§6 简历上传优化 M4)', () => {
  const USER = '1001';
  const career = { id: 5n, name: '产品经理', category: '互联网' };

  const goodSuggestions = JSON.stringify({
    matchScore: 82,
    overallComment: '整体不错',
    items: [{ section: '技能', original: 'SQL', suggestion: '补充数据分析', reason: '岗位要求' }],
    missingKeywords: ['数据分析'],
  });

  const pdfBuf = () => Buffer.concat([Buffer.from('%PDF-'), Buffer.from('rest-of-pdf-bytes')]);
  const makeFile = (over?: any) => ({
    originalname: 'resume.pdf',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: pdfBuf(),
    ...over,
  });
  const form = { targetCareerId: '5', note: '希望强调项目经验' };

  const makePrisma = (opts?: { career?: any; dupText?: string; todayCount?: number; createId?: bigint }) =>
    ({
      career: { findFirst: jest.fn(async () => (opts && 'career' in opts ? opts.career : career)) },
      aiResumeDoc: {
        findMany: jest.fn(async () =>
          opts?.dupText ? [{ extractedText: opts.dupText }] : [],
        ),
        count: jest.fn(async () => opts?.todayCount ?? 0),
        create: jest.fn(async () => ({ id: opts?.createId ?? 90n })),
        findFirst: jest.fn(),
      },
    }) as any;

  const makeLlm = (opts?: { text?: string; degraded?: boolean }) =>
    ({
      chat: jest.fn(async () => ({
        text: opts?.text ?? goodSuggestions,
        provider: 'mock',
        model: 'm',
        degraded: opts?.degraded ?? false,
      })),
    }) as any;

  beforeEach(() => {
    __pdfText = '这是一段用于测试的简历正文，包含足够字符以通过最小长度校验。产品经理 需求分析 SQL 项目管理经验。';
  });

  it('正常流：解析建议，degraded=false，落库返回 docId + suggestions', async () => {
    const prisma = makePrisma();
    const svc = new AiResumeService(prisma, makeLlm());
    const vo = await svc.optimize(USER, makeFile(), form as any);
    expect(vo.degraded).toBe(false);
    expect(vo.docId).toBe('90');
    expect(vo.suggestions.matchScore).toBe(82);
    expect(vo.suggestions.targetCareer.name).toBe('产品经理');
   expect(prisma.aiResumeDoc.create).toHaveBeenCalled();
  });

  it('4620：无文件抛 RESUME_FILE_REQUIRED', async () => {
    const svc = new AiResumeService(makePrisma(), makeLlm());
    await expect(svc.optimize(USER, undefined, form as any)).rejects.toMatchObject({
      bizCode: BizCode.RESUME_FILE_REQUIRED,
    } as Partial<BizException>);
  });

  it('4621：非 PDF（mimetype/魔数不符）抛 RESUME_FILE_TYPE_INVALID', async () => {
    const svc = new AiResumeService(makePrisma(), makeLlm());
    const bad = makeFile({ mimetype: 'image/png', buffer: Buffer.from('PNG..') });
    await expect(svc.optimize(USER, bad, form as any)).rejects.toMatchObject({
      bizCode: BizCode.RESUME_FILE_TYPE_INVALID,
    } as Partial<BizException>);
  });

  it('4622：>10MB 抛 RESUME_FILE_TOO_LARGE', async () => {
    const svc = new AiResumeService(makePrisma(), makeLlm());
    const big = makeFile({ size: 11 * 1024 * 1024 });
 await expect(svc.optimize(USER, big, form as any)).rejects.toMatchObject({
      bizCode: BizCode.RESUME_FILE_TOO_LARGE,
    } as Partial<BizException>);
  });

  it('4624：目标岗位不存在抛 RESUME_TARGET_CAREER_REQUIRED', async () => {
    const svc = new AiResumeService(makePrisma({ career: null }), makeLlm());
    await expect(svc.optimize(USER, makeFile(), form as any)).rejects.toMatchObject({
      bizCode: BizCode.RESUME_TARGET_CAREER_REQUIRED,
    } as Partial<BizException>);
  });

  it('4623：PDF 提取空/过短抛 RESUME_PARSE_FAILED', async () => {
    __pdfText = '   ';
    const svc = new AiResumeService(makePrisma(), makeLlm());
    await expect(svc.optimize(USER, makeFile(), form as any)).rejects.toMatchObject({
      bizCode: BizCode.RESUME_PARSE_FAILED,
    } as Partial<BizException>);
  });

  it('4625：文本超 20000 字抛 RESUME_CONTENT_TOO_LONG', async () =>{
    __pdfText = '简'.repeat(20001);
    const svc = new AiResumeService(makePrisma(), makeLlm());
    await expect(svc.optimize(USER, makeFile(), form as any)).rejects.toMatchObject({
      bizCode: BizCode.RESUME_CONTENT_TOO_LONG,
    } as Partial<BizException>);
  });

  it('4516：敏感词抛 AI_SENSITIVE_CONTENT，且不调 LLM', async () => {
    __pdfText = '这份简历包含赌博相关的违规内容，其余部分正常填充足够字符。';
    const llm = makeLlm();
    const svc = new AiResumeService(makePrisma(), llm);
    await expect(svc.optimize(USER, makeFile(), form as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_SENSITIVE_CONTENT,
    } as Partial<BizException>);
    expect(llm.chat).not.toHaveBeenCalled();
  });

  it('4090：近 10min 同哈希严格防重抛 DUPLICATE_SUBMIT', async () => {
    const dupText = '这是一段用于测试的简历正文，包含足够字符以通过最小长度校验。产品经理 需求分析 SQL 项目管理经验。';
    __pdfText = dupText;
    const svc = new AiResumeService(makePrisma({ dupText }), makeLlm());
    await expect(svc.optimize(USER, makeFile(), form as any)).rejects.toMatchObject({
      bizCode: BizCode.DUPLICATE_SUBMIT,
    } as Partial<BizException>);
  });

  it('4501：当日配额已满抛 AI_QUOTA_LIMIT', async () => {
    const svc = new AiResumeService(makePrisma({ todayCount: 10 }), makeLlm());
    await expect(svc.optimize(USER, makeFile(), form as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_QUOTA_LIMIT,
    } as Partial<BizException>);
  });

  it('LLM degraded=true：结构化兜底 degraded=true 且 items 非空', async () => {
    const svc = new AiResumeService(makePrisma(), makeLlm({ degraded: true }));
    const vo = await svc.optimize(USER, makeFile(), form as any);
    expect(vo.degraded).toBe(true);
    expect(vo.suggestions.items.length).toBeGreaterThan(0);
  });

  it('getOptimizeDoc 不存在：抛 AI_NOT_FOUND(4004)', async () => {
    const prisma = makePrisma();
    prisma.aiResumeDoc.findFirst = jest.fn(async () => null);
    const svc = new AiResumeService(prisma, makeLlm());
    await expect(svc.getOptimizeDoc(USER, '999')).rejects.toMatchObject({
      bizCode: BizCode.AI_NOT_FOUND,
    } as Partial<BizException>);
  });

  it('getOptimizeDoc 越权：非本人抛 AI_FORBIDDEN(4003)', async () => {
    const prisma = makePrisma();
    prisma.aiResumeDoc.findFirst = jest.fn(async () => ({
      id: 90n, userId: 2002n, sourceFileName: 'r.pdf',
      suggestions: JSON.parse(goodSuggestions), degraded: 0, expireAt: new Date(),
    }));
    const svc = new AiResumeService(prisma, makeLlm());
    await expect(svc.getOptimizeDoc(USER, '90')).rejects.toMatchObject({
      bizCode: BizCode.AI_FORBIDDEN,
    } as Partial<BizException>);
  });
});