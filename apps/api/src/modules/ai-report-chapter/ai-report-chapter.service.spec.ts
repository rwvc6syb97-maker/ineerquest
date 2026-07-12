import { AiReportChapterService } from './ai-report-chapter.service';
import { BizCode, BizException } from '../../common/response';
import { ReportType } from '../report/report.constants';

/**
 * §3.3 AiReportChapterService 单测（纯内存 mock）。
 * 覆盖：正常流、报告不存在(4004)、越权(4003)、非 DEEP(4517)、LLM 降级。
 * 护城河：断言只写 reportAiChapter，绝不触碰 report / reportSection 本体表。
 */
describe('AiReportChapterService (§3.3 深度报告扩展章节)', () => {
  const USER = '1001';
  const deepReport = { id: 7n, userId: 1001n, reportType: ReportType.DEEP, mbtiType: 'INTJ' };

  const goodJson = JSON.stringify({
    title: '职业发展深度扩展',
    paragraphs: ['第一段洞察', '第二段建议'],
  });

  const makePrisma = (opts?: { report?: any }) =>
    ({
      report: { findFirst: jest.fn(async () => (opts && 'report' in opts ? opts.report : deepReport)) },
      career: { findFirst: jest.fn(async () => ({ name: '产品经理' })) },
      reportAiChapter: { create: jest.fn(async () => ({ id: 55n })) },
      reportSection: { create: jest.fn() },
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

  const dto = { reportId: '7', focus: 'career', focusCareerId: '5' };

  it('正常流：解析 LLM，degraded=false，只落 reportAiChapter（护城河）', async () => {
    const prisma = makePrisma();
    const svc = new AiReportChapterService(prisma, makeLlm());
    const vo = await svc.generate(USER, dto as any);
    expect(vo.degraded).toBe(false);
    expect(vo.chapterId).toBe('55');
    expect(vo.reportId).toBe('7');
    expect(vo.paragraphs.length).toBe(2);
    expect(prisma.reportAiChapter.create).toHaveBeenCalled();
    // 护城河：绝不写本体表
    expect(prisma.reportSection.create).not.toHaveBeenCalled();
  });

  it('报告不存在：抛 AI_NOT_FOUND(4004)', async () => {
    const prisma = makePrisma({ report: null });
    const svc = new AiReportChapterService(prisma, makeLlm());
    await expect(svc.generate(USER, dto as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_NOT_FOUND,
    } as Partial<BizException>);
  });

  it('越权：他人报告抛 AI_FORBIDDEN(4003)', async () => {
    const prisma = makePrisma({ report: { ...deepReport, userId: 9999n } });
    const svc = new AiReportChapterService(prisma, makeLlm());
    await expect(svc.generate(USER, dto as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_FORBIDDEN,
    } as Partial<BizException>);
  });

  it('非 DEEP 报告：抛 AI_NEED_DEEP_REPORT(4517)，且不调 LLM', async () => {
    const prisma = makePrisma({ report: { ...deepReport, reportType: ReportType.BASIC } });
    const llm = makeLlm();
    const svc = new AiReportChapterService(prisma, llm);
    await expect(svc.generate(USER, dto as any)).rejects.toMatchObject({
      bizCode: BizCode.AI_NEED_DEEP_REPORT,
    } as Partial<BizException>);
    expect(llm.chat).not.toHaveBeenCalled();
  });

  it('LLM degraded=true：回退规则版，degraded=true 且 paragraphs 非空', async () => {
    const prisma = makePrisma();
    const svc = new AiReportChapterService(prisma, makeLlm({ degraded: true }));
    const vo = await svc.generate(USER, dto as any);
    expect(vo.degraded).toBe(true);
    expect(vo.paragraphs.length).toBeGreaterThan(0);
  });
});