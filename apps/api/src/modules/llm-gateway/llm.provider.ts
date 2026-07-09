import { Injectable, Logger } from '@nestjs/common';
import { ChatMessage, LlmProviderName } from './llm-gateway.constants';

/**
 * T3-01 LLM Provider 抽象接口（多 provider 路由的统一契约）。
 * 真实 provider（OpenAI 兼容）为 blocked：LLM_API_KEY/LLM_BASE_URL 占位，见《阶段3-人工调试待办清单.md》。
 */
export interface LlmProvider {
  readonly name: LlmProviderName;
  /**
   * 流式生成：返回异步迭代器，逐 token 产出增量文本。
   * 网关在此之上叠加首 token 超时重试 / 熔断降级。
   */
  chatStream(messages: ChatMessage[], model: string): AsyncIterable<string>;
}

/** MockLlmProvider 选项（供单测注入可控行为）。 */
export interface MockProviderOptions {
  /** 每个 token 之间的延迟（ms），模拟流式；单测可设 0 */
  tokenDelayMs?: number;
  /** 首 token 前的额外延迟（ms），用于模拟超时/熔断场景 */
  firstTokenDelayMs?: number;
  /** 设为 true 时抛错，模拟 provider 异常 */
  throwError?: boolean;
  /** 覆盖生成文本（缺省根据用户输入回显构造） */
  fixedText?: string;
}

/**
 * MockLlmProvider — 无真实 Key 时的默认 provider。
 * - 流式逐 token 输出（异步迭代器）
 * - 可注入延迟/异常，支撑 T3-02 超时重试/熔断降级单测
 * - 不依赖任何外部网络，保证编译与单测绿灯
 */
@Injectable()
export class MockLlmProvider implements LlmProvider {
  readonly name = LlmProviderName.MOCK;
  private readonly logger = new Logger(MockLlmProvider.name);

  constructor(private readonly options: MockProviderOptions = {}) {}

  private buildText(messages: ChatMessage[]): string {
    if (this.options.fixedText) return this.options.fixedText;
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const raw = lastUser?.content;
    // content 可能是纯文本或图文混合块，统一提取文本用于回显
    const text =
      typeof raw === 'string'
        ? raw
        : (raw ?? [])
            .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
            .map((p) => p.text)
            .join(' ');
    const seed = (text || '你好').slice(0, 40);
    return `【模拟解读】基于「${seed}」为你生成的深度分析：你的特质与优势清晰，建议结合实际持续实践。`;
 }

  async *chatStream(messages: ChatMessage[], model: string): AsyncIterable<string> {
    const { tokenDelayMs = 5, firstTokenDelayMs = 0, throwError = false } = this.options;
    this.logger.debug(`mock chatStream model=${model} msgs=${messages.length}`);

    if (firstTokenDelayMs > 0) {
      await new Promise((r) => setTimeout(r, firstTokenDelayMs));
    }
    if (throwError) {
      throw new Error('mock provider forced error');
    }

    const text = this.buildText(messages);
    // 逐“token”（此处按字符切分模拟）流式输出
    for (const ch of text) {
      if (tokenDelayMs > 0) {
        await new Promise((r) => setTimeout(r, tokenDelayMs));
      }
      yield ch;
    }
  }
}

/**
 * OpenAiLlmProvider — 真实 OpenAI 兼容 Provider（DeepSeek / OpenAI / 其他）。
 * 通过 LLM_PROVIDER_ENABLED=true + LLM_API_KEY + LLM_BASE_URL 启用。
 */
@Injectable()
export class OpenAiLlmProvider implements LlmProvider {
  readonly name = LlmProviderName.OPENAI;
  private readonly logger = new Logger(OpenAiLlmProvider.name);

  private get enabled(): boolean {
    const flag = (process.env.LLM_PROVIDER_ENABLED ?? 'false').toLowerCase() === 'true';
    const key = process.env.LLM_API_KEY ?? '';
    const base = process.env.LLM_BASE_URL ?? '';
    return flag && !!key && key !== 'CHANGE_ME' && !!base && base !== 'CHANGE_ME';
  }

  async *chatStream(messages: ChatMessage[], model: string): AsyncIterable<string> {
    if (!this.enabled) {
      this.logger.warn('OpenAiLlmProvider disabled(blocked): missing real LLM_API_KEY/LLM_BASE_URL');
      throw new Error('openai provider disabled(blocked): missing credentials');
    }

    const baseUrl = (process.env.LLM_BASE_URL ?? '').replace(/\/$/, '');
    const apiKey = process.env.LLM_API_KEY ?? '';
    const url = process.env.LLM_API_URL ?? `${baseUrl}/chat/completions`;

    this.logger.debug(`LLM call: model=${model} msgs=${messages.length} url=${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown');
      this.logger.error(`LLM API error status=${response.status}: ${errText.slice(0, 200)}`);
      throw new Error(`LLM API error ${response.status}: ${errText.slice(0, 100)}`);
    }

    const reader = response.body;
    if (!reader) throw new Error('LLM response body is null');

    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of reader as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // 跳过非标准 SSE 行
        }
      }
    }
  }
}

@Injectable()
export class OxyGentLlmProvider implements LlmProvider {
  readonly name = LlmProviderName.OXYGENT;
  private readonly logger = new Logger(OxyGentLlmProvider.name);

  private get oxygentUrl(): string {
    return (process.env.OXYGENT_URL ?? 'http://localhost:8001').replace(/\/$/, '');
  }

  private get enabled(): boolean {
    const flag = (process.env.OXYGENT_ENABLED ?? 'false').toLowerCase() === 'true';
    return flag;
  }

  async *chatStream(messages: ChatMessage[], model: string): AsyncIterable<string> {
    if (!this.enabled) {
      this.logger.warn('OxyGentLlmProvider disabled(blocked): OXYGENT_ENABLED is false');
      throw new Error('oxygent provider disabled(blocked): OXYGENT_ENABLED is false');
    }

    const url = `${this.oxygentUrl}/chat/stream`;
    this.logger.debug(`OxyGent call: model=${model} msgs=${messages.length} url=${url}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          model,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => 'unknown');
        this.logger.error(`OxyGent API error status=${response.status}: ${errText.slice(0, 200)}`);
        throw new Error(`OxyGent API error ${response.status}: ${errText.slice(0, 100)}`);
      }

      const reader = response.body;
      if (!reader) throw new Error('OxyGent response body is null');

      const decoder = new TextDecoder();
      let buffer = '';

      for await (const chunk of reader as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);

          try {
            const json = JSON.parse(data);
            if (json.done && !json.delta) return;
            if (json.delta) yield json.delta;
          } catch {
            // 跳过非标准 SSE 行
          }
        }
      }
    } catch (err) {
      this.logger.error(`OxyGent provider error: ${(err as Error).message}`);
      throw err;
    }
  }
}