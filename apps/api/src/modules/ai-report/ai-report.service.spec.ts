import { AiReportService } from './ai-report.service';
import { BizCode, BizException } from '../../common/response';

/**
 * L-P0-1 · AiReportService 单测（纯内存 mock，无真实 DB/网络）。
 *
 * 逐条验收断言：
 *  - 正常流：LLM 正常返回 → plainText=LLM文本、degraded=false
 *  - 降级流：LLM degraded=true → 用兜底摘要、degraded=true
 *  - 降级流：LLM 返回空文本 → 同样兜底 degraded=true
 *  - 报告不存在/无权：getReportForOwner 抛 4203 → 透传
 *  - 指定章节非法：sectionKey 不在可见章节 → 抛 4511
 */
describe('AiReportService (L-P0-1 报告人话翻译)', () => {
  const USER = '1001';

  const overview = {
    mbtiType: 'INTJ',
    summary: '你是天生的策略规划者。',
    sections: [
      { sectionKey: 'strengths', title: '你的优势', content: '深度思考、长远规划。' },
      { sectionKey: 'career', title: '职业方向', content: '适合战略、研发类岗位。' },
    ],
  };

  const makeReportService = (ov: any = overview) =>
    ({ getReportForOwner: jest.fn(async () => ov) }) as any;

  const makeLlm = (opts?: { text?: string; degraded?: boolean; degradeReason?: string }) =>
    ({
      chat: jest.fn(async () => ({
        text: opts?.text ?? '简单说，你擅长把复杂的事想清楚，然后一步步落地。',
        provider: 'mock',
        model: 'mock-1',
        degraded: opts?.degraded ?? false,
        degradeReason: opts?.degradeReason,
      })),
    }) as any;

  const build = (opts?: { report?: any; llm?: any }) => {
    const report = opts?.report ?? makeReportService();
    const llm = opts?.llm ?? makeLlm();
    const svc = new AiReportService(report, llm);
    return { svc, report, llm };
  };

  it('正常流：返回 LLM 文本且 degraded=false', async () => {
    const { svc } = build();
    const vo = await svc.plainTalk(USER, { reportId: '10086' });
    expect(vo.degraded).toBe(false);
    expect(vo.plainText).toContain('简单说');
  });

  it('降级流：LLM degraded=true → 用兜底摘要且 degraded=true', async () => {
    const { svc } = build({ llm: makeLlm({ degraded: true, degradeReason: 'provider_error' }) });
    const vo = await svc.plainTalk(USER, { reportId: '10086' });
    expect(vo.degraded).toBe(true);
    expect(vo.degradeReason).toBe('provider_error');
    expect(vo.plainText).toContain('INTJ');
  });

  it('降级流：LLM 返回空文本 → 兜底且 degraded=true', async () => {
    const { svc } = build({ llm: makeLlm({ text: '   ' }) });
    const vo = await svc.plainTalk(USER, { reportId: '10086' });
    expect(vo.degraded).toBe(true);
    expect(vo.plainText).toContain('INTJ');
  });

  it('指定章节命中：只翻译该章节，不报错', async () => {
    const { svc} = build();
    const vo = await svc.plainTalk(USER, { reportId: '10086', sectionKey: 'strengths' });
    expect(vo.degraded).toBe(false);
  });

  it('指定章节非法：sectionKey 不在可见章节 → 抛 4511', async () => {
    const { svc } = build();
    await expect(
      svc.plainTalk(USER, { reportId: '10086', sectionKey: 'not-exist' }),
    ).rejects.toMatchObject({ bizCode: BizCode.PLAIN_TALK_SECTION_INVALID });
  });

  it('报告不存在/无权：getReportForOwner 抛 4203 → 透传', async () => {
    const report = makeReportService();
    report.getReportForOwner = jest.fn(async () => {
      throw new BizException(BizCode.ASSESSMENT_RECORD_NOT_FOUND, '报告不存在', 200);
    });
    const { svc } = build({ report });
    await expect(svc.plainTalk(USER, { reportId: '999' })).rejects.toMatchObject({
      bizCode: BizCode.ASSESSMENT_RECORD_NOT_FOUND,
    });
  });
});