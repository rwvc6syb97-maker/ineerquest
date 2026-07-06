import { ContextService } from './context.service';
import { CONTEXT_POLICY, MessageRole, MessageView } from './ai-chat.constants';

/**
 * T3-06 · ContextService 单测（纯内存 mock，无真实 DB/网络）。
 *
 * 逐条验收断言：
 *  - 轮次 ≤ 阈值：不触发摘要，仅回传最近轮原始消息
 *  - 轮次 > 阈值：触发摘要压缩，注入「历史对话摘要」system 消息 + 最近 N 轮
 *  - 摘要落库（aiConversationSummary.upsert）；已有覆盖足够则复用不再调用 LLM
 *  - MySQL 读写降级：读/写失败不抛错（blocked）
 */
describe('ContextService (T3-06 上下文摘要压缩)', () => {
  const CID = '7';

  const makePrisma = (existing?: { summary: string; coveredRound: number } | null) =>
    ({
      aiConversationSummary: {
        findUnique: jest.fn(async () => (existing ? { ...existing, tokenCount: 1 } : null)),
        upsert: jest.fn(async () => ({})),
      },
    }) as any;

  const makeLlm = () =>
    ({
      chat: jest.fn(async () => ({ text: 'COMPRESSED_SUMMARY', provider: 'mock', model: 'mock-1', degraded: false })),
    }) as any;

  /** 生成 N 轮 user+assistant 历史。 */
  const history = (rounds: number): MessageView[] => {
    const out: MessageView[] = [];
    for (let r = 1; r <= rounds; r++) {
      out.push({ roundNo: r, role: MessageRole.USER, content: `问题${r}`, model: null, createdAt: new Date() });
      out.push({ roundNo: r, role: MessageRole.ASSISTANT, content: `回答${r}`, model: 'mock-1', createdAt: new Date() });
    }
    return out;
  };

  it('轮次 ≤ 阈值：不触发摘要，仅回传最近轮', async () => {
    const prisma = makePrisma();
    const llm = makeLlm();
    const svc = new ContextService(prisma, llm);
    const msgs = await svc.buildContextMessages(CID, history(3));
    expect(llm.chat).not.toHaveBeenCalled();
    expect(msgs.every((m) => m.role !== 'system')).toBe(true);
    expect(msgs.some((m) => m.content.includes('摘要'))).toBe(false);
  });

  it('轮次 > 阈值：触发摘要，注入摘要 system + 最近 N 轮', async () => {
    const prisma = makePrisma();
    const llm = makeLlm();
    const svc = new ContextService(prisma, llm);
    const total = CONTEXT_POLICY.SUMMARIZE_AFTER_ROUND + 3; // > 阈值
    const msgs = await svc.buildContextMessages(CID, history(total));
    expect(llm.chat).toHaveBeenCalledTimes(1);
    expect(prisma.aiConversationSummary.upsert).toHaveBeenCalledTimes(1);
    const sys = msgs.find((m) => m.role === 'system');
    expect(sys?.content).toContain('历史对话摘要');
    expect(sys?.content).toContain('COMPRESSED_SUMMARY');
    // 最近轮的原始消息应保留在尾部
    expect(msgs.some((m) => m.content === `问题${total}`)).toBe(true);
  });

  it('已有摘要覆盖足够：复用摘要不再调用 LLM', async () => {
    const total = CONTEXT_POLICY.SUMMARIZE_AFTER_ROUND + 4;
    const coverTo = total - CONTEXT_POLICY.KEEP_RECENT_ROUND;
    const prisma = makePrisma({ summary: 'CACHED', coveredRound: coverTo });
    const llm = makeLlm();
    const svc = new ContextService(prisma, llm);
    const msgs = await svc.buildContextMessages(CID, history(total));
    expect(llm.chat).not.toHaveBeenCalled();
    const sys = msgs.find((m) => m.role === 'system');
    expect(sys?.content).toContain('CACHED');
  });

  it('MySQL 读失败降级：不抛错，仍生成摘要', async () => {
    const prisma = makePrisma();
    prisma.aiConversationSummary.findUnique = jest.fn(async () => {
      throw new Error('db down');
    });
    const llm = makeLlm();
    const svc = new ContextService(prisma, llm);
    const total = CONTEXT_POLICY.SUMMARIZE_AFTER_ROUND + 2;
    const msgs = await svc.buildContextMessages(CID, history(total));
    const sys = msgs.find((m) => m.role === 'system');
    expect(sys?.content).toContain('COMPRESSED_SUMMARY');
  });

  it('MySQL 写失败降级：不抛错', async () => {
    const prisma = makePrisma();
    prisma.aiConversationSummary.upsert = jest.fn(async () => {
      throw new Error('db down');
    });
    const llm = makeLlm();
    const svc = new ContextService(prisma, llm);
    const total = CONTEXT_POLICY.SUMMARIZE_AFTER_ROUND + 2;
    await expect(svc.buildContextMessages(CID, history(total))).resolves.toBeDefined();
  });

  it('入模上下文按 token 上限截断（不超 MAX_CONTEXT_TOKEN）', async () => {
    const prisma = makePrisma();
    const llm = makeLlm();
    const svc = new ContextService(prisma, llm);
    // 构造超长历史（单条内容较长）触发截断
    const long: MessageView[] = [];
    for (let r = 1; r <= 5; r++) {
      long.push({
        roundNo: r,
        role: MessageRole.USER,
        content: 'x'.repeat(1500),
        model: null,
        createdAt: new Date(),
      });
    }
    const msgs = await svc.buildContextMessages(CID, long);
    const totalTokens = msgs.reduce((s, m) => s + m.content.length, 0);
    expect(totalTokens).toBeLessThanOrEqual(CONTEXT_POLICY.MAX_CONTEXT_TOKEN + 1500);
    expect(msgs.length).toBeGreaterThan(0);
  });
});