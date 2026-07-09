import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { LlmGatewayService } from '../llm-gateway/llm-gateway.service';
import {
  CONTEXT_POLICY,
  MessageRole,
  MessageView,
  estimateTokens,
} from './ai-chat.constants';
import { ChatMessage, ChatContentPart } from '../llm-gateway/llm-gateway.constants';

/**
 * 将 ChatMessage.content（纯文本或图文混合块）归一化为纯文本，
 * 供 token 估算 / 关键字匹配使用（图片块以其 url 计入，避免丢失长度）。
 */
function contentToText(content: string | ChatContentPart[]): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => (part.type === 'text' ? part.text : part.image_url.url))
    .join('');
}

/**
 * T3-06 · 上下文摘要压缩服务（ContextService）。
 *
 * 职责（对齐主计划验收：超长上下文自动摘要，token 受控）：
 *  - 当会话历史轮次超过阈值时，将早期消息压缩为摘要，写入 ai_conversation_summary（MySQL，1:1）；
 *  - 组装入模上下文 = 「摘要（若有） + 最近 N 轮原始消息」，控制近似 token ≤ MAX_CONTEXT_TOKEN；
 *  - 摘要生成复用 LlmGatewayService.chat（无 Key 时走 Mock 兜底，不阻塞）。
 *
 * blocked：真实摘要质量依赖真实 LLM provider；无 Key 时摘要为 Mock 文案，见待办清单。
 * 缺 MySQL 实例时 summary 读写降级为内存态（不落库、不阻断）。
 */
@Injectable()
export class ContextService {
  private readonly logger = new Logger(ContextService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmGatewayService,
  ) {}

  /**
   * 组装本轮入模上下文消息。
   * @param conversationId 会话自增 id（string 化的 BigInt）
   * @param history 全量历史消息（按 roundNo 升序，含 user/assistant）
   * @returns 分层 messages（system 摘要 + 最近 N 轮）
   */
  async buildContextMessages(
    conversationId: string,
    history: MessageView[],
  ): Promise<ChatMessage[]> {
    const totalRound = this.maxRound(history);
    const messages: ChatMessage[] = [];

    // 轮次超阈值：触发摘要压缩，注入摘要 system 消息
    if (totalRound > CONTEXT_POLICY.SUMMARIZE_AFTER_ROUND) {
      const summary = await this.ensureSummary(conversationId, history);
      if (summary) {
        messages.push({ role: 'system', content: `【历史对话摘要】\n${summary}` });
      }
    }

    // 保留最近 N 轮原始消息
    const recent = this.recentMessages(history);
    for (const m of recent) {
      messages.push({
        role: m.role === MessageRole.USER ? 'user' : 'assistant',
        content: m.content,
      });
    }

    return this.truncateByToken(messages);
  }

  /** 取历史最大轮次。 */
  private maxRound(history: MessageView[]): number {
    return history.reduce((max, m) => (m.roundNo > max ? m.roundNo : max), 0);
  }

  /** 取最近 KEEP_RECENT_ROUND 轮的消息（按 roundNo）。 */
  private recentMessages(history: MessageView[]): MessageView[] {
    const maxRound = this.maxRound(history);
    const floor = maxRound - CONTEXT_POLICY.KEEP_RECENT_ROUND;
    return history.filter((m) => m.roundNo > floor);
  }

  /**
   * 确保存在覆盖到「最近 N 轮之前」的摘要；不足则（重新）生成并落库。
   * 返回摘要文本（无法生成时返回空串，调用方降级为仅最近轮）。
   */
  async ensureSummary(conversationId: string, history: MessageView[]): Promise<string> {
    const maxRound = this.maxRound(history);
    const coverTo = maxRound - CONTEXT_POLICY.KEEP_RECENT_ROUND;
    if (coverTo <= 0) return '';

    // 读既有摘要（MySQL 降级：读失败视为无摘要）
    const existing = await this.readSummary(conversationId);
    if (existing && existing.coveredRound >= coverTo) {
      return existing.summary;
    }

    // 需要压缩的早期消息
    const early = history.filter((m) => m.roundNo <= coverTo);
    if (early.length === 0) return existing?.summary ?? '';

    const summaryText = await this.summarize(early, existing?.summary);
    await this.writeSummary(conversationId, summaryText, coverTo);
    return summaryText;
  }

  /** 调用 LLM 生成摘要（复用网关，Mock 兜底）。 */
  private async summarize(early: MessageView[], prevSummary?: string): Promise<string> {
    const transcript = early
      .map((m) => `${m.role === MessageRole.USER ? '用户' : '助手'}：${m.content}`)
      .join('\n');
    const contextPart = prevSummary ? `已有摘要：\n${prevSummary}\n\n新增对话：\n` : '';
    const result = await this.llm.chat({
      prompt: {
        system: '你是对话摘要器。将多轮对话压缩为要点摘要，保留关键事实、用户诉求与已给建议，去除寒暄。',
        context: `${contextPart}${transcript}`,
        user: `请输出不超过 ${CONTEXT_POLICY.MAX_SUMMARY_TOKEN} 字的中文摘要。`,
      },
      scene: 'ai-chat-summary',
    });
    return this.clampToken(result.text, CONTEXT_POLICY.MAX_SUMMARY_TOKEN);
  }

  /** 读摘要（Prisma，降级为 null）。 */
  private async readSummary(
    conversationId: string,
  ): Promise<{ summary: string; coveredRound: number } | null> {
    try {
      const row = await this.prisma.aiConversationSummary.findUnique({
        where: { conversationId: BigInt(conversationId) },
      });
      return row ? { summary: row.summary, coveredRound: row.coveredRound } : null;
    } catch (err) {
      this.logger.warn(`read summary degraded(blocked): ${(err as Error).message}`);
      return null;
    }
  }

  /** 落摘要（Prisma upsert，降级为不落库不阻断）。 */
  private async writeSummary(
    conversationId: string,
    summary: string,
    coveredRound: number,
  ): Promise<void> {
    const tokenCount = estimateTokens(summary);
    try {
      await this.prisma.aiConversationSummary.upsert({
        where: { conversationId: BigInt(conversationId) },
        create: { conversationId: BigInt(conversationId), summary, coveredRound, tokenCount },
        update: { summary, coveredRound, tokenCount },
      });
    } catch (err) {
      this.logger.warn(`write summary degraded(blocked): ${(err as Error).message}`);
    }
  }

  /** 按近似 token 上限从尾部保留消息（优先保近轮），控制入模 token。 */
  private truncateByToken(messages: ChatMessage[]): ChatMessage[] {
    let budget = CONTEXT_POLICY.MAX_CONTEXT_TOKEN;
    const kept: ChatMessage[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const cost = estimateTokens(contentToText(messages[i].content));
      if (cost > budget && kept.length > 0) break;
      budget -= cost;
      kept.unshift(messages[i]);
    }
    return kept;
  }

  /** 字符近似截断到 token 上限。 */
  private clampToken(text: string, maxToken: number): string {
    return text.length > maxToken ? text.slice(0, maxToken) : text;
  }
}