import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../infra/redis/redis.service';
import {
  ChatMessage,
  ChatRequest,
  ChatResult,
  ChatStreamChunk,
  DegradeReason,
  LayeredPrompt,
  LLM_FALLBACK_TEXT,
  LLM_RATE_LIMIT,
  LLM_TIMEOUT_POLICY,
  LlmProviderName,
} from './llm-gateway.constants';
import { LlmProvider, MockLlmProvider, OpenAiLlmProvider, OxyGentLlmProvider } from './llm.provider';

/**
 * T3-01/T3-02/T3-03 · LLM 网关统一出。
 *
 * 职责（逐条对齐主计划验收标准）：
 *  - T3-01 统一调用出口（chat/chatStream）+ 多模型路由（provider/model 可配置）+ Prompt 分层编排（system/role/context/user）。
 *  - T3-02 首 token>10s 触发重试；>30s 熔断降级返回兜底模板；超时不阻塞请求（始终有返回）。
 *  - T3-03 Redis 固定窗口限流；触发限流则降级返回兜底文案；Redis 不可用时降级放行不阻断。
 *
 * blocked：真实 provider（OpenAI 兼容）无 Key，默认走 MockLlmProvider；见《阶段3-人工调试待办清单.md》。
 */
@Injectable()
export class LlmGatewayService {
  private readonly logger = new Logger(LlmGatewayService.name);
  private readonly providers = new Map<LlmProviderName, LlmProvider>();

  constructor(
    private readonly redis: RedisService,
    private readonly mockProvider: MockLlmProvider,
    private readonly openaiProvider: OpenAiLlmProvider,
    private readonly oxygentProvider: OxyGentLlmProvider,
  ) {
    this.providers.set(LlmProviderName.MOCK, mockProvider);
    this.providers.set(LlmProviderName.OPENAI, openaiProvider);
    this.providers.set(LlmProviderName.OXYGENT, oxygentProvider);
  }

  /** 默认 provider：OxyGent > OpenAI > Mock（优先级递减）。 */
  private get defaultProvider(): LlmProviderName {
    const oxygentEnabled = (process.env.OXYGENT_ENABLED ?? 'false').toLowerCase() === 'true';
    if (oxygentEnabled) return LlmProviderName.OXYGENT;
    
    const flag = (process.env.LLM_PROVIDER_ENABLED ?? 'false').toLowerCase() === 'true';
    const key = process.env.LLM_API_KEY ?? '';
    if (flag && key && key !== 'CHANGE_ME') return LlmProviderName.OPENAI;
    return LlmProviderName.MOCK;
  }

  private get defaultModel(): string {
    return process.env.LLM_MODEL ?? 'mock-1';
  }

  /** T3-01 Prompt 分层编排：system/role/context/user → messages。 */
  buildMessages(req: ChatRequest): ChatMessage[] {
    if (req.messages && req.messages.length > 0) return req.messages;
    const p: LayeredPrompt = req.prompt ?? { user: '' };
    const messages: ChatMessage[] = [];
    const systemParts = [p.system, p.role].filter((x): x is string => !!x && x.trim().length > 0);
    if (systemParts.length > 0) {
      messages.push({ role: 'system', content: systemParts.join('\n') });
    }
    if (p.context && p.context.trim()) {
      messages.push({ role: 'system', content: `【上下文】\n${p.context}` });
    }
    // 图像层：存在公开图像 URL 时，构造图文混合 content（Agnes AI 图像理解）
    const images = (p.images ?? []).filter((u) => !!u && u.trim().length > 0);
    if (images.length > 0) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: p.user ?? '' },
          ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
        ],
      });
    } else {
      messages.push({ role: 'user', content: p.user ?? '' });
    }
    return messages;
  }

  /** T3-01 provider 路由（可配置，未知/未启用回退默认）。 */
  private resolveProvider(name?: LlmProviderName): LlmProvider {
    const target = name ?? this.defaultProvider;
    return this.providers.get(target) ?? this.mockProvider;
  }

  // ============ T3-03 Redis 限流 ============

  /**
   * 固定窗口计数限流。返回 true=允许，false=触发限流。
   * Redis 不可用时 try-catch 降级放行（返回 true），不阻断请求。
   */
  async checkRateLimit(callerId?: string, scene = 'default'): Promise<boolean> {
    if (!callerId) return true;
    const key = `${LLM_RATE_LIMIT.REDIS_PREFIX}${scene}:${callerId}`;
    try {
      const count = await this.redis.raw.incr(key);
      if (count === 1) {
        await this.redis.raw.expire(key, LLM_RATE_LIMIT.WINDOW_SEC);
      }
      return count <= LLM_RATE_LIMIT.MAX_PER_WINDOW;
    } catch (err) {
      // 降级放行（标 blocked），不阻断请求
      this.logger.warn(`llm rate-limit degraded(blocked): ${(err as Error).message}`);
      return true;
    }
  }

  // ============ T3-02 首 token 超时/重试/熔断 ============

  /**
   * 包装 provider 流，叠加：
   *  - 首 token 软超时（>10s）触发一次重试；
   *  - 熔断硬超时（>30s）直接降级兜底；
   *  - provider 抛错 → 降级兜底。
   * 始终产出可迭代流（超时不抛出、不阻塞上层）。
   */
  private async *streamWithPolicy(
    provider: LlmProvider,
    messages: ChatMessage[],
    model: string,
  ): AsyncGenerator<ChatStreamChunk> {
    const maxRetries = LLM_TIMEOUT_POLICY.MAX_RETRIES;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const startedAt = Date.now();
      let firstTokenGot = false;
      try {
        const iterator = provider.chatStream(messages, model)[Symbol.asyncIterator]();
        while (true) {
          const remainToCircuit = LLM_TIMEOUT_POLICY.CIRCUIT_BREAK_MS - (Date.now() - startedAt);
          // 首 token 用较短的软超时；后续 token 用熔断剩余时间兜底
          const budget = firstTokenGot
            ? Math.max(1, remainToCircuit)
            : Math.min(LLM_TIMEOUT_POLICY.FIRST_TOKEN_RETRY_MS, Math.max(1, remainToCircuit));

          const step = await this.raceTimeout(iterator.next(), budget);

          if (step === TIMEOUT) {
            const elapsed = Date.now() - startedAt;
            // 熔断硬超时：直接降级兜底，结束
            if (elapsed >= LLM_TIMEOUT_POLICY.CIRCUIT_BREAK_MS || firstTokenGot) {
              yield* this.fallbackStream(DegradeReason.CIRCUIT_TIMEOUT);
              return;
            }
            // 首 token 软超时：抛出触发重试
            throw new FirstTokenTimeoutError();
          }

          if (step.done) return;
          firstTokenGot = true;
          yield { delta: step.value as string, done: false };
        }
      } catch (err) {
        if (err instanceof FirstTokenTimeoutError && attempt < maxRetries) {
          this.logger.warn(`llm first-token timeout, retry attempt=${attempt + 1}`);
          continue; // 重试
        }
        const reason =
          err instanceof FirstTokenTimeoutError
            ? DegradeReason.RETRY_EXHAUSTED
            : DegradeReason.PROVIDER_ERROR;
        this.logger.warn(`llm stream degraded(${reason}): ${(err as Error).message}`);
        yield* this.fallbackStream(reason);
        return;
      }
    }
    // 理论不可达；兜底
    yield* this.fallbackStream(DegradeReason.RETRY_EXHAUSTED);
  }

  private async *fallbackStream(reason: DegradeReason): AsyncGenerator<ChatStreamChunk> {
    yield { delta: LLM_FALLBACK_TEXT, done: false, degraded: true, degradeReason: reason };
  }

  /** Promise 竞速超时：超时返回哨兵 TIMEOUT。 */
  private raceTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<typeof TIMEOUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMEOUT), ms);
    });
    return Promise.race([p.then((v) => v), timeout]).finally(() => clearTimeout(timer));
  }

  // ============ T3-01 统一出口 ============

  /**
   * 流式统一出口。先限流（触发→兜底流），再按超时策略产出增量。
   * 始终返回可迭代流，超时/异常不抛出、不阻塞。
   */
  async *chatStream(req: ChatRequest): AsyncGenerator<ChatStreamChunk> {
    const allowed = await this.checkRateLimit(req.callerId, req.scene);
    if (!allowed) {
      this.logger.warn(`llm rate-limited caller=${req.callerId} scene=${req.scene}`);
      yield { delta: LLM_FALLBACK_TEXT, done: false, degraded: true, degradeReason: DegradeReason.RATE_LIMITED };
      yield { delta: '', done: true, degraded: true, degradeReason: DegradeReason.RATE_LIMITED };
      return;
    }
    const provider = this.resolveProvider(req.provider);
    const model = req.model ?? this.defaultModel;
    const messages = this.buildMessages(req);

    let degraded = false;
    let reason: DegradeReason | undefined;
    for await (const chunk of this.streamWithPolicy(provider, messages, model)) {
      if (chunk.degraded) {
        degraded = true;
        reason = chunk.degradeReason;
      }
      if (chunk.delta) yield chunk;
    }
    yield { delta: '', done: true, degraded, degradeReason: reason };
  }

  /**
   * 非流式统一出口：聚合 chatStream 全部增量为完整文本。
   * 返回统一结果结构，供 report 等模块直接消费。
   */
  async chat(req: ChatRequest): Promise<ChatResult> {
    const provider = req.provider ?? this.defaultProvider;
    const model = req.model ?? this.defaultModel;
    let text = '';
    let degraded = false;
    let reason: DegradeReason | undefined;

    for await (const chunk of this.chatStream(req)) {
      if (chunk.degraded) {
        degraded = true;
        reason = chunk.degradeReason;
      }
      if (chunk.delta) text += chunk.delta;
    }

    return {
      text: text || LLM_FALLBACK_TEXT,
      provider,
      model,
      degraded,
      degradeReason: reason,
      traceId: req.traceId,
    };
  }
}

/** 首 token 软超时内部错误（触发重试）。 */
class FirstTokenTimeoutError extends Error {
  constructor() {
    super('first-token-timeout');
    this.name = 'FirstTokenTimeoutError';
  }
}

/** 超时竞速哨兵。 */
const TIMEOUT = Symbol('LLM_TIMEOUT');