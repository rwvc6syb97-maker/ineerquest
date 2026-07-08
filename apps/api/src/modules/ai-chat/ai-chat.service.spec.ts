import { AiChatService } from './ai-chat.service';
import { BizCode, CommonCode, BizException } from '../../common/response';
import { ConversationScene, ConversationStatus, MAX_ROUND, DAILY_QUOTA } from './ai-chat.constants';
import type { ChatStreamChunk } from '../llm-gateway/llm-gateway.constants';

/**
 * T3-04 / T3-05 / T3-07 · AiChatService 单测（纯内存 mock，无真实 DB/Redis/网络）。
 *
 * 逐条验收断言：
 *  - T3-04 会话 CRUD：创建/列表/删除/归属校验（非本人 → NOT_FOUND）
 *  - T3-05 SSE 流式：streamMessage 逐块 delta，末尾 done=true（controller 据此发 event:done）
 *  - T3-07 50 轮 → 抛 50002(AI_ROUND_LIMIT)；日配额超限 → 抛 50001(AI_QUOTA_LIMIT)；Redis 不可用降级放行
 */
describe('AiChatService (T3-04/05/07)', () => {
  const USER = '1001';

  /** Prisma mock：内存单会话行。 */
  const makePrisma = (conv?: Partial<any>) => {
    const row = {
      id: 7n,
      convNo: 'convabc',
      userId: BigInt(USER),
      scene: ConversationScene.FREE,
      bizType: null,
      bizId: null,
      title: null,
      roundCount: 0,
      maxRound: MAX_ROUND,
      tokenUsed: 0,
      status: ConversationStatus.ACTIVE,
      lastMsgAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      isDeleted: 0,
      deletedAt: null,
      ...conv,
    };
    return {
      row,
      aiConversation: {
        create: jest.fn(async ({ data }: any) => ({ ...row, ...data, id: 7n, createdAt: row.createdAt })),
        findMany: jest.fn(async () => [row]),
        findUnique: jest.fn(async () => row),
        update: jest.fn(async () => row),
      },
      aiMessage: {
        create: jest.fn(async () => ({})),
        findMany: jest.fn(async () => []),
      },
    } as any;
  };

  /** Redis mock：incr 计数 + expire。 */
  const makeRedis = (start = 0) => {
    let n = start;
    return { raw: { incr: jest.fn(async () => ++n), expire: jest.fn(async () => 1) } } as any;
  };

  /** LLM 网关 mock：chatStream 产两块 + done；chat 返回摘要文本。 */
  const makeLlm = (deltas = ['你好', '，我在。']) =>
    ({
      async *chatStream(): AsyncGenerator<ChatStreamChunk> {
        for (const d of deltas) yield { delta: d, done: false };
        yield { delta: '', done: true };
      },
      chat: jest.fn(async () => ({ text: 'MOCK_SUMMARY', provider: 'mock', model: 'mock-1', degraded: false })),
    }) as any;

  /** Context mock：直接回传最近历史，避免依赖真实摘要。 */
  const makeContext = () =>
    ({
      buildContextMessages: jest.fn(async (_id: string, history: any[]) =>
        history.map((m) => ({ role: m.role === 1 ? 'user' : 'assistant', content: m.content })),
      ),
    }) as any;

  const build = (opts?: { prisma?: any; redis?: any; llm?: any; context?: any }) => {
    const prisma = opts?.prisma ?? makePrisma();
    const redis = opts?.redis ?? makeRedis();
    const llm = opts?.llm ?? makeLlm();
    const context = opts?.context ?? makeContext();
    const svc = new AiChatService(prisma, redis, llm, context);
    return { svc, prisma, redis, llm, context };
  };

  // ============ T3-04 会话 CRUD ============
  describe('T3-04 会话 CRUD', () => {
    it('createConversation 返回视图（隐藏 id，仅 convNo）', async () => {
      const { svc } = build();
      const view = await svc.createConversation(USER, { scene: ConversationScene.FREE });
      expect(view.convNo).toMatch(/^[0-9a-f]{32}$/); // Char32 UUID 去横线
      expect((view as any).id).toBeUndefined();
      expect(view.maxRound).toBe(MAX_ROUND);
      expect(view.status).toBe(ConversationStatus.ACTIVE);
    });

    it('listConversations 返回当前用户会话', async () => {
      const { svc } = build();
      const list = await svc.listConversations(USER);
      expect(list).toHaveLength(1);
      expect(list[0].convNo).toBe('convabc');
    });

    it('deleteConversation 软删本人会话', async () => {
      const { svc, prisma } = build();
      const r = await svc.deleteConversation(USER, 'convabc');
      expect(r.convNo).toBe('convabc');
      expect(prisma.aiConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isDeleted: 1 }) }),
      );
    });

    it('非本人会话 → 抛 NOT_FOUND', async () => {
      const { svc } = build();
      await expect(svc.deleteConversation('9999', 'convabc')).rejects.toMatchObject({
        bizCode: CommonCode.NOT_FOUND,
      });
    });

    it('会话不存在 → 抛 NOT_FOUND', async () => {
      const prisma = makePrisma();
      prisma.aiConversation.findUnique = jest.fn(async () => null);
      const { svc } = build({ prisma });
      await expect(svc.listMessages(USER, 'nope')).rejects.toBeInstanceOf(BizException);
    });
  });

  // ============ T3-05 SSE 流式 ============
  describe('T3-05 发送消息 SSE 流式', () => {
    it('streamMessage 逐块 delta 且末尾 done=true', async () => {
      const { svc } = build();
      const chunks: ChatStreamChunk[] = [];
      for await (const c of svc.streamMessage(USER, 'convabc', '我该转行吗')) chunks.push(c);
      expect(chunks.some((c) => c.delta === '你好')).toBe(true);
      expect(chunks[chunks.length - 1].done).toBe(true);
    });

    it('streamMessage 落用户+AI 消息并更新会话计数', async () => {
      const { svc, prisma } = build();
      const it = svc.streamMessage(USER, 'convabc', 'hi');
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of it) { /* drain */ }
      expect(prisma.aiConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ roundCount: 1 }) }),
      );
    });
  });

  // ============ T3-07 50 轮 + 每日配额 ============
  describe('T3-07 50 轮 + 每日配额校验', () => {
    it('会话达 50 轮 → 抛 50002(AI_ROUND_LIMIT)', async () => {
      const prisma = makePrisma({ roundCount: MAX_ROUND });
      const { svc } = build({ prisma });
      const it = svc.streamMessage(USER, 'convabc', 'again');
      await expect(it.next()).rejects.toMatchObject({ bizCode: BizCode.AI_ROUND_LIMIT });
    });

    it('日配额超限 → 抛 50001(AI_QUOTA_LIMIT)', async () => {
      const prisma = makePrisma();
      const redis = makeRedis(DAILY_QUOTA); // 下一次 incr → DAILY_QUOTA+1
      const { svc } = build({ prisma, redis });
      const it = svc.streamMessage(USER, 'convabc', 'q');
      await expect(it.next()).rejects.toMatchObject({ bizCode: BizCode.AI_QUOTA_LIMIT });
    });

    it('Redis 不可用 → 日配额降级放行（仍能流式完成）', async () => {
      const prisma = makePrisma();
      const redis = { raw: { incr: jest.fn(async () => { throw new Error('redis down'); }), expire: jest.fn() } } as any;
      const { svc } = build({ prisma, redis });
      const chunks: ChatStreamChunk[] = [];
      for await (const c of svc.streamMessage(USER, 'convabc', 'q')) chunks.push(c);
      expect(chunks[chunks.length - 1].done).toBe(true);
    });
  });
});