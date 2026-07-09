import { LlmGatewayService } from './llm-gateway.service';
import { MockLlmProvider, OpenAiLlmProvider, OxyGentLlmProvider, LlmProvider } from './llm.provider';
import {
  DegradeReason,
  LLM_FALLBACK_TEXT,
  LLM_RATE_LIMIT,
  LlmProviderName,
} from './llm-gateway.constants';

/**
 * T3-01/T3-02/T3-03 LlmGatewayService 单测（纯内存 mock，无网络/真实 Redis）。
 *
 * 逐条验收断言：
 *  - T3-01 统一出口 chat/chatStream + Prompt 分层可配置 + 多模型路由
 *  - T3-02 首 token>10s 重试；>30s 熔断降级兜底；超时不阻塞（始终返回）
 *  - T3-03 Redis 限流触发 → 降级兜底；Redis 不可用 → 降级放行不阻断
 */
describe('LlmGatewayService (T3-01/02/03)', () => {
  /** 可控 Redis mock：incr 计数 + expire。 */
  const makeRedis = (over: Partial<{ incr: jest.Mock; expire: jest.Mock }> = {}) => {
    let n = 0;
    const raw: any = {
      incr: over.incr ?? jest.fn(async () => ++n),
      expire: over.expire ?? jest.fn(async () => 1),
    };
    return { raw } as any;
  };

  const build = (
    mockOpts?: ConstructorParameters<typeof MockLlmProvider>[0],
    redis = makeRedis(),
  ) => {
    const mock = new MockLlmProvider(mockOpts);
    const openai = new OpenAiLlmProvider();
    const oxygent = new OxyGentLlmProvider();
    const svc = new LlmGatewayService(redis, mock, openai, oxygent);
    return { svc, redis, mock, openai, oxygent };
  };

  // 单元测试环境隔离：清除真实 .env 注入的 LLM provider 相关变量，
  // 确保 provider 路由默认落到 Mock（不依赖本地 .env / 真实 Key / 网络）。
  const LLM_ENV_KEYS = [
    'LLM_PROVIDER_ENABLED',
    'LLM_API_KEY',
    'LLM_BASE_URL',
    'LLM_MODEL',
    'OXYGENT_ENABLED',
  ] as const;
  let savedLlmEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedLlmEnv = {};
    for (const k of LLM_ENV_KEYS) {
      savedLlmEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    for (const k of LLM_ENV_KEYS) {
      if (savedLlmEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedLlmEnv[k];
    }
  });

  // ============ T3-01 ============
  describe('T3-01 统一出口 + Prompt 分层 + 多模型路由', () => {
    it('chat 返回完整文本，走 mock provider（无 Key 默认 mock）', async () => {
      const { svc } = build({ tokenDelayMs: 0, fixedText: 'HELLO_DEEP' });
      const res = await svc.chat({ prompt: { user: '介绍我的性格' } });
      expect(res.text).toBe('HELLO_DEEP');
      expect(res.provider).toBe(LlmProviderName.MOCK);
      expect(res.degraded).toBe(false);
    });

    it('Prompt 分层编排：system/role 合并为 system 消息，context 独立，user 末尾', () => {
      const { svc } = build({ tokenDelayMs: 0 });
      const msgs = svc.buildMessages({
        prompt: { system: 'SYS', role: 'ROLE', context: 'CTX', user: 'Q' },
      });
      expect(msgs[0]).toEqual({ role: 'system', content: 'SYS\nROLE' });
      expect(msgs[1]).toEqual({ role: 'system', content: '【上下文】\nCTX' });
      expect(msgs[2]).toEqual({ role: 'user', content: 'Q' });
    });

    it('messages 优先于 prompt（可直接传多轮消息）', () => {
      const { svc } = build({ tokenDelayMs: 0 });
      const direct = [{ role: 'user' as const, content: 'X' }];
      expect(svc.buildMessages({ prompt: { user: 'ignored' }, messages: direct })).toBe(direct);
    });

    it('chatStream 流式逐 token 输出，最终 done=true', async () => {
      const { svc } = build({ tokenDelayMs: 0, fixedText: 'abc' });
      const deltas: string[] = [];
      let done = false;
      for await (const c of svc.chatStream({ prompt: { user: 'hi' } })) {
        if (c.delta) deltas.push(c.delta);
        if (c.done) done = true;
      }
      expect(deltas.join('')).toBe('abc');
      expect(done).toBe(true);
  });

    it('多模型路由：显式指定 provider=mock 生效', async () => {
      const { svc } = build({ tokenDelayMs: 0, fixedText: 'M' });
      const res = await svc.chat({ prompt: { user: 'q' }, provider: LlmProviderName.MOCK, model: 'mock-x' });
      expect(res.provider).toBe(LlmProviderName.MOCK);
      expect(res.model).toBe('mock-x');
    });
  });

  // ============ T3-02 ============
  describe('T3-02 超时重试 / 熔断降级（不阻塞）', () => {
    it('首 token >10s：触发重试，第二次成功则正常返回（不阻塞）', async () => {
      // 首次 provider 首 token 延迟 12s（>10s 软超时）触发重试；重试用一个立即成功的 provider。
      let attempt = 0;
      const flaky: LlmProvider = {
        name: LlmProviderName.MOCK,
        async *chatStream() {
          attempt++;
          if (attempt === 1) {
            await new Promise((r) => setTimeout(r, 12_000)); // 首 token 软超时
            yield 'late';
          } else {
            yield 'OK';
          }
        },
      };
      const redis = makeRedis();
      const svc = new LlmGatewayService(redis, flaky as any, new OpenAiLlmProvider(), new OxyGentLlmProvider());

      jest.useFakeTimers();
      const collect = (async () => {
        let text = '';
        let degraded = false;
        for await (const c of svc.chatStream({ prompt: { user: 'q' }, provider: LlmProviderName.MOCK })) {
          if (c.delta) text += c.delta;
          if (c.degraded) degraded = true;
        }
        return { text, degraded };
      })();
      // 推进超过 10s 触发软超时 → 重试 → 第二次立即产出
      await jest.advanceTimersByTimeAsync(11_000);
      await jest.runAllTimersAsync();
      const out = await collect;
      expect(attempt).toBe(2);
      expect(out.text).toBe('OK');
      expect(out.degraded).toBe(false);
    });

    it('首 token >30s：熔断降级返回兜底文案（重试耗尽后仍超时→兜底，始终有返回）', async () => {
      // provider 每次都延迟超过软超时；重试耗尽后降级兜底。
      const slow: LlmProvider = {
        name: LlmProviderName.MOCK,
        async *chatStream() {
          await new Promise((r) => setTimeout(r, 40_000)); // 远超熔断
          yield 'never';
        },
      };
      const redis = makeRedis();
      const svc = new LlmGatewayService(redis, slow as any, new OpenAiLlmProvider(), new OxyGentLlmProvider());

      jest.useFakeTimers();
      const collect = (async () => {
        let text = '';
        let reason: DegradeReason | undefined;
        for await (const c of svc.chatStream({ prompt: { user: 'q' }, provider: LlmProviderName.MOCK })) {
          if (c.delta) text += c.delta;
          if (c.degradeReason) reason = c.degradeReason;
        }
        return { text, reason };
      })();
      await jest.advanceTimersByTimeAsync(11_000); // 首次软超时 → 重试
      await jest.advanceTimersByTimeAsync(11_000); // 重试再次软超时 → 耗尽降级
      await jest.runAllTimersAsync();
      const out = await collect;
      expect(out.text).toContain(LLM_FALLBACK_TEXT);
      expect(out.reason).toBe(DegradeReason.RETRY_EXHAUSTED);
    });

    it('provider 抛错：降级兜底，不抛出到上层', async () => {
      const { svc } = build({ tokenDelayMs: 0, throwError: true });
      const res = await svc.chat({ prompt: { user: 'q' } });
      expect(res.degraded).toBe(true);
      expect(res.degradeReason).toBe(DegradeReason.PROVIDER_ERROR);
      expect(res.text).toContain(LLM_FALLBACK_TEXT);
    });
  });

  // ============ T3-03 ============
  describe('T3-03 Redis 限流 + 降级兜底', () => {
    it('未超限：正常放行', async () => {
      const { svc } = build({ tokenDelayMs: 0, fixedText: 'OK' });
      const res = await svc.chat({ prompt: { user: 'q' }, callerId: 'u1' });
      expect(res.text).toBe('OK');
      expect(res.degraded).toBe(false);
    });

    it('超过窗口上限：触发限流 → 降级返回兜底文案', async () => {
      // incr 直接返回超过上限的计数
      const redis = makeRedis({ incr: jest.fn(async () => LLM_RATE_LIMIT.MAX_PER_WINDOW + 1) });
      const svc = new LlmGatewayService(redis, new MockLlmProvider({ tokenDelayMs: 0 }), new OpenAiLlmProvider(), new OxyGentLlmProvider());
      const res = await svc.chat({ prompt: { user: 'q' }, callerId: 'u-hot' });
      expect(res.degraded).toBe(true);
      expect(res.degradeReason).toBe(DegradeReason.RATE_LIMITED);
      expect(res.text).toContain(LLM_FALLBACK_TEXT);
    });

    it('首次调用设置窗口过期（expire 被调用一次）', async () => {
      const redis = makeRedis();
      const svc = new LlmGatewayService(redis, new MockLlmProvider({ tokenDelayMs: 0 }), new OpenAiLlmProvider(), new OxyGentLlmProvider());
      await svc.chat({ prompt: { user: 'q' }, callerId: 'u2', scene: 's1' });
      expect(redis.raw.expire).toHaveBeenCalledTimes(1);
    });

    it('Redis 不可用：降级放行，不阻断请求', async () => {
      const redis = makeRedis({
        incr: jest.fn(async () => {
          throw new Error('redis down');
        }),
      });
      const svc = new LlmGatewayService(redis, new MockLlmProvider({ tokenDelayMs: 0, fixedText: 'STILL_OK' }), new OpenAiLlmProvider(), new OxyGentLlmProvider());
      const res = await svc.chat({ prompt: { user: 'q' }, callerId: 'u3' });
      expect(res.text).toBe('STILL_OK'); // 放行成功
      expect(res.degraded).toBe(false);
    });

    it('无 callerId：不限流直接放行', async () => {
      const redis = makeRedis({ incr: jest.fn() });
      const svc = new LlmGatewayService(redis, new MockLlmProvider({ tokenDelayMs: 0, fixedText: 'A' }), new OpenAiLlmProvider(), new OxyGentLlmProvider());
      const res = await svc.chat({ prompt: { user: 'q' } });
      expect(res.text).toBe('A');
      expect(redis.raw.incr).not.toHaveBeenCalled();
    });
  });
});