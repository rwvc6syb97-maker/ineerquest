import { AiCoachingService } from './ai-coaching.service';
import { BizCode, BizException } from '../../common/response';
import { CoachingOrderStatus } from '../coaching/coaching.constants';

/** 构造一个可用的 LLM chat 返回。 */
function llmResult(over: Partial<{ text: string; degraded: boolean; degradeReason: string }> = {}) {
  return {
    text: over.text ?? '',
    provider: 'test',
    model: 'test-model',
    degraded: over.degraded ?? false,
    degradeReason: over.degradeReason ?? '',
  };
}

/** 生成 mock PrismaService。 */
function makePrisma() {
  return {
    coachingOrder: { findFirst: jest.fn() },
    coachingSession: { findUnique: jest.fn() },
    coachingMessage: { findMany: jest.fn() },
    coach: { findMany: jest.fn() },
    coachingPreBrief: { create: jest.fn(), findUnique: jest.fn() },
    coachingSummary: { create: jest.fn(), findUnique: jest.fn() },
  };
}

const P2002 = { code: 'P2002' };

describe('AiCoachingService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let llm: { chat: jest.Mock };
  let service: AiCoachingService;

  beforeEach(() => {
    prisma = makePrisma();
    llm = { chat: jest.fn() };
    service = new AiCoachingService(prisma as never, llm as never);
  });

  // ===================== §2.2 preBrief =====================
  describe('preBrief', () => {
    const dto = { orderId: '10', answers: [{ question: '如何转型', answer: '想做产品' }] };

    it('正常流：LLM 返回合法 JSON → degraded=false', async () => {
      prisma.coachingOrder.findFirst.mockResolvedValue({ id: 10n, userId: 1n, status: CoachingOrderStatus.PAID });
      llm.chat.mockResolvedValue(llmResult({ text: '{"outline":"1. 目标\\n2. 障碍","tags":["转型","产品"]}' }));
      prisma.coachingPreBrief.create.mockResolvedValue({ id: 88n });

      const res = await service.preBrief('1', dto as never);
      expect(res.degraded).toBe(false);
      expect(res.briefId).toBe('88');
      expect(res.outline).toContain('目标');
      expect(res.tags).toEqual(['转型', '产品']);
    });

    it('订单不存在 → AI_NOT_FOUND(4004)', async () => {
      prisma.coachingOrder.findFirst.mockResolvedValue(null);
      await expect(service.preBrief('1', dto as never)).rejects.toMatchObject({
        bizCode: BizCode.AI_NOT_FOUND,
      });
    });

    it('非本人订单 → AI_FORBIDDEN(4003)', async () => {
      prisma.coachingOrder.findFirst.mockResolvedValue({ id: 10n, userId: 999n, status: CoachingOrderStatus.PAID });
      await expect(service.preBrief('1', dto as never)).rejects.toMatchObject({
        bizCode: BizCode.AI_FORBIDDEN,
      });
    });

    it('订单已完成 → COACHING_PRE_BRIEF_NOT_ALLOWED(4710)', async () => {
      prisma.coachingOrder.findFirst.mockResolvedValue({ id: 10n, userId: 1n, status: CoachingOrderStatus.FINISHED });
      await expect(service.preBrief('1', dto as never)).rejects.toMatchObject({
     bizCode: BizCode.COACHING_PRE_BRIEF_NOT_ALLOWED,
      });
    });

    it('LLM 非法 JSON → 降级 degraded=true', async () => {
      prisma.coachingOrder.findFirst.mockResolvedValue({ id: 10n, userId: 1n, status: CoachingOrderStatus.PAID });
      llm.chat.mockResolvedValue(llmResult({ text: 'not json' }));
      prisma.coachingPreBrief.create.mockResolvedValue({ id: 89n });

      const res = await service.preBrief('1', dto as never);
      expect(res.degraded).toBe(true);
      expect(res.outline).toContain('如何转型');
    });

    it('幂等：P2002 时查回已存在提纲 degraded=false', async () => {
      prisma.coachingOrder.findFirst.mockResolvedValue({ id: 10n, userId: 1n, status: CoachingOrderStatus.PAID });
      llm.chat.mockResolvedValue(llmResult({ text: '{"outline":"x","tags":["a"]}' }));
      prisma.coachingPreBrief.create.mockRejectedValue(P2002);
      prisma.coachingPreBrief.findUnique.mockResolvedValue({ id: 77n, outline: 'exist', tags: ['t'] });

      const res = await service.preBrief('1', dto as never);
      expect(res.briefId).toBe('77');
      expect(res.outline).toBe('exist');
      expect(res.degraded).toBe(false);
    });
  });

  // ===================== §2.3 summary =====================
  describe('summary', () => {
    const dto = { orderId: '20' };

    it('正常流：LLM 合法 JSON → degraded=false', async () => {
      prisma.coachingOrder.findFirst.mockResolvedValue({ id: 20n, userId: 1n, status: CoachingOrderStatus.FINISHED });
      prisma.coachingSession.findUnique.mockResolvedValue({ id: 5n, msgCount: 3 });
      prisma.coachingMessage.findMany.mockResolvedValue([{ senderRole: 1, content: '你好' }]);
      llm.chat.mockResolvedValue(
        llmResult({ text: '{"summary":"完成","todos":[{"title":"跟进","done":false}]}' }),
      );
      prisma.coachingSummary.create.mockResolvedValue({ id: 66n });

      const res = await service.summary('1', dto as never);
      expect(res.degraded).toBe(false);
      expect(res.summaryId).toBe('66');
      expect(res.todos[0]).toEqual({ title: '跟进', done: false });
    });

    it('咨询未结束 → COACHING_SUMMARY_NOT_FINISHED(4711)', async () => {
      prisma.coachingOrder.findFirst.mockResolvedValue({ id: 20n, userId: 1n, status: CoachingOrderStatus.PAID });
      await expect(service.summary('1', dto as never)).rejects.toMatchObject({
        bizCode: BizCode.COACHING_SUMMARY_NOT_FINISHED,
      });
    });

    it('会话无 session → COACHING_SUMMARY_NO_MESSAGE(4712)', async () => {
      prisma.coachingOrder.findFirst.mockResolvedValue({ id: 20n, userId: 1n, status: CoachingOrderStatus.FINISHED });
      prisma.coachingSession.findUnique.mockResolvedValue(null);
      await expect(service.summary('1', dto as never)).rejects.toMatchObject({
        bizCode: BizCode.COACHING_SUMMARY_NO_MESSAGE,
      });
    });

    it('session 有但消息为空 → COACHING_SUMMARY_NO_MESSAGE(4712)', async () => {
      prisma.coachingOrder.findFirst.mockResolvedValue({ id: 20n, userId: 1n, status: CoachingOrderStatus.FINISHED });
      prisma.coachingSession.findUnique.mockResolvedValue({ id: 5n, msgCount: 2 });
      prisma.coachingMessage.findMany.mockResolvedValue([]);
      await expect(service.summary('1', dto as never)).rejects.toMatchObject({
        bizCode: BizCode.COACHING_SUMMARY_NO_MESSAGE,
      });
    });

    it('LLM 降级 → 兜底 summary degraded=true', async () => {
      prisma.coachingOrder.findFirst.mockResolvedValue({ id: 20n, userId: 1n, status: CoachingOrderStatus.FINISHED });
      prisma.coachingSession.findUnique.mockResolvedValue({ id: 5n, msgCount: 1 });
      prisma.coachingMessage.findMany.mockResolvedValue([{ senderRole: 1, content: 'hi' }]);
      llm.chat.mockResolvedValue(llmResult({ degraded: true }));
      prisma.coachingSummary.create.mockResolvedValue({ id: 67n });

      const res = await service.summary('1', dto as never);
      expect(res.degraded).toBe(true);
      expect(res.todos.length).toBeGreaterThan(0);
    });
  });

  // ===================== §2.4 match =====================
  describe('match', () => {
    const dto = { demand: '产品 转型 面试', topN: 2 };

    it('正常流：打分排序 + LLM 理由 → degraded=false', async () => {
      prisma.coach.findMany.mockResolvedValue([
        { id: 1n, realName: '张三', title: 'T', intro: '产品转型专家', expertise: ['产品', '转型'], rating: 5 },
        { id: 2n, realName: '李四', title: 'T', intro: '面试辅导', expertise: ['面试'], rating: 4 },
        { id: 3n, realName: '王五', title: 'T', intro: '其他', expertise: [], rating: 3 },
      ]);
      llm.chat.mockResolvedValue(
        llmResult({ text: '{"reasons":[{"coachId":"1","reason":"高度契合"},{"coachId":"2","reason":"面试强"}]}' }),
      );

      const res = await service.match('1', dto as never);
      expect(res.degraded).toBe(false);
      expect(res.matches.length).toBe(2);
      expect(res.matches[0].matchScore).toBeGreaterThanOrEqual(res.matches[1].matchScore);
      expect(res.matches[0].reason).toBeTruthy();
    });

    it('无可用辅导师 → COACHING_MATCH_NO_COACH(4713)', async () => {
      prisma.coach.findMany.mockResolvedValue([]);
      await expect(service.match('1', dto as never)).rejects.toMatchObject({
        bizCode: BizCode.COACHING_MATCH_NO_COACH,
      });
    });

    it('LLM 降级 → 规则理由 degraded=true', async () => {
      prisma.coach.findMany.mockResolvedValue([
        { id: 1n, realName: '张三', title: 'T', intro: '产品转型', expertise: ['产品'], rating: 5 },
      ]);
      llm.chat.mockResolvedValue(llmResult({ degraded: true }));

      const res = await service.match('1', dto as never);
      expect(res.degraded).toBe(true);
      expect(res.matches[0].reason).toContain('擅长');
    });
  });

  it('BizException 携带正确 bizCode', () => {
    const e = new BizException(BizCode.AI_NOT_FOUND, 'x');
    expect(e.bizCode).toBe(4004);
  });
});