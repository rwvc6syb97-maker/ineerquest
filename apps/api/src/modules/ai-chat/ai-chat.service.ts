import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Collection } from 'mongodb';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { MongoService } from '../../infra/mongo/mongo.service';
import { BizCode, CommonCode, BizException } from '../../common/response';
import { LlmGatewayService } from '../llm-gateway/llm-gateway.service';
import { ContextService } from './context.service';
import {
  AI_CHAT_SYSTEM_PROMPT,
  AI_MESSAGE_COLLECTION,
  ConversationScene,
  ConversationStatus,
  ConversationView,
  DAILY_QUOTA,
  MAX_ROUND,
  MessageDoc,
  MessageRole,
  MessageView,
  QUOTA_REDIS,
  estimateTokens,
} from './ai-chat.constants';
import { CreateConversationDto } from './ai-chat.dto';
import { ChatStreamChunk } from '../llm-gateway/llm-gateway.constants';

/**
 * T3-04 / T3-05 / T3-07 · AI 对话服务。
 *
 *  - T3-04 会话 CRUD：会话元数据落 MySQL(ai_conversation)，消息流落 MongoDB(集合 ai_message)。
 *  - T3-05 发送消息 SSE：streamMessage() 产出 ChatStreamChunk，逐 token；done 由 controller 转 event:done。
 *  - T3-07 50 轮 + 每日配额：Redis 计数，超 50 轮抛 50002(AI_ROUND_LIMIT)，超配额抛 50001(AI_QUOTA_LIMIT)。
 *
 * 降级：缺 Mongo → 消息不落库但流式仍返回（标 blocked）；缺 Redis → 配额放行（标 blocked）；
 *       缺 MySQL → CRUD 抛错由上层捕获，属外部实连 blocked。
 */
@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mongo: MongoService,
    private readonly llm: LlmGatewayService,
    private readonly context: ContextService,
  ) {}

  // ============ T3-04 会话 CRUD ============

  /** 生成对外会话编号 conv_no（Char32，UUID 去横线，防遍历）。 */
  private genConvNo(): string {
    return randomUUID().replace(/-/g, '');
  }

  /** 创建会话。 */
  async createConversation(userId: string, dto: CreateConversationDto): Promise<ConversationView> {
    const row = await this.prisma.aiConversation.create({
      data: {
        convNo: this.genConvNo(),
        userId: BigInt(userId),
        scene: dto.scene ?? ConversationScene.FREE,
        bizType: dto.bizType ?? null,
        bizId: dto.bizId != null ? BigInt(dto.bizId) : null,
        title: dto.title ?? null,
        roundCount: 0,
        maxRound: MAX_ROUND,
        status: ConversationStatus.ACTIVE,
      },
    });
    return this.toView(row);
  }

  /** 会话列表（当前用户，未删除，按最后消息时间倒序）。 */
  async listConversations(userId: string): Promise<ConversationView[]> {
    const rows = await this.prisma.aiConversation.findMany({
      where: { userId: BigInt(userId), isDeleted: 0 },
      orderBy: [{ lastMsgAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    return rows.map((r) => this.toView(r));
  }

  /** 删除会话（软删，仅本人）。 */
  async deleteConversation(userId: string, convNo: string): Promise<{ convNo: string }> {
    const conv = await this.mustOwnConversation(userId, convNo);
    await this.prisma.aiConversation.update({
      where: { id: conv.id },
      data: { isDeleted: 1, deletedAt: new Date() },
    });
    return { convNo };
  }

  /** 会话消息列表（Mongo 流，按 roundNo 升序）。 */
  async listMessages(userId: string, convNo: string): Promise<MessageView[]> {
    const conv = await this.mustOwnConversation(userId, convNo);
    return this.readMessages(conv.id.toString());
  }

  /** 校验会话归属，返回会话行；不存在/非本人抛 BizException。 */
  private async mustOwnConversation(userId: string, convNo: string) {
    const conv = await this.prisma.aiConversation.findUnique({ where: { convNo } });
    if (!conv || conv.isDeleted === 1 || conv.userId !== BigInt(userId)) {
      throw new BizException(CommonCode.NOT_FOUND, '会话不存在或无权访问', 200);
    }
    return conv;
  }

  private toView(row: {
    convNo: string;
    scene: number;
    title: string | null;
    roundCount: number;
    maxRound: number;
    status: number;
    lastMsgAt: Date | null;
    createdAt: Date;
  }): ConversationView {
    return {
      convNo: row.convNo,
      scene: row.scene,
      title: row.title,
      roundCount: row.roundCount,
      maxRound: row.maxRound,
      status: row.status,
      lastMsgAt: row.lastMsgAt,
      createdAt: row.createdAt,
    };
  }

  // ============ Mongo 消息流读写（降级安全） ============

  private messageCollection(): Collection<MessageDoc> | null {
    try {
      return this.mongo.getDb().collection<MessageDoc>(AI_MESSAGE_COLLECTION);
    } catch (err) {
      this.logger.warn(`mongo message store degraded(blocked): ${(err as Error).message}`);
      return null;
    }
  }

  /** 读会话消息（Mongo，降级为空数组）。 */
  private async readMessages(conversationId: string): Promise<MessageView[]> {
    const col = this.messageCollection();
    if (!col) return [];
    try {
      const docs = await col
        .find({ conversationId })
        .sort({ roundNo: 1, role: 1 })
        .limit(1000)
        .toArray();
      return docs.map((d) => ({
        roundNo: d.roundNo,
        role: d.role,
        content: d.content,
        model: d.model,
        createdAt: d.createdAt,
      }));
    } catch (err) {
      this.logger.warn(`read messages degraded(blocked): ${(err as Error).message}`);
      return [];
    }
  }

  /** 写一条消息（Mongo，降级为不落库不阻断）。 */
  private async writeMessage(doc: MessageDoc): Promise<void> {
    const col = this.messageCollection();
    if (!col) return;
    try {
      await col.insertOne(doc);
    } catch (err) {
      this.logger.warn(`write message degraded(blocked): ${(err as Error).message}`);
    }
  }

  // ============ T3-07 50 轮 + 每日配额校验 ============

  /**
   * 校验并预占本轮配额。
   *  - 会话轮次达 50 → 抛 50002(AI_ROUND_LIMIT)，并置会话 status=3；
   *  - 每日配额超限 → 抛 50001(AI_QUOTA_LIMIT)。
   * Redis 不可用时日配额放行（标 blocked），轮次基于 MySQL round_count 仍生效。
   */
  private async guardQuota(userId: string, roundCount: number): Promise<void> {
    // T3-07 单会话 ≤50 轮
    if (roundCount >= MAX_ROUND) {
      throw new BizException(BizCode.AI_ROUND_LIMIT, '本次对话已达 50 轮上限', 200);
    }
    // T3-07 每日配额（Redis 计数）
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const key = `${QUOTA_REDIS.DAILY_PREFIX}${day}:${userId}`;
    try {
      const count = await this.redis.raw.incr(key);
      if (count === 1) {
        await this.redis.raw.expire(key, QUOTA_REDIS.DAILY_TTL_SEC);
      }
      if (count > DAILY_QUOTA) {
        throw new BizException(BizCode.AI_QUOTA_LIMIT, '今日 AI 对话配额已用尽', 200);
      }
    } catch (err) {
      if (err instanceof BizException) throw err;
      this.logger.warn(`daily quota degraded(blocked): ${(err as Error).message}`);
    }
  }

  // ============ T3-05 发送消息（SSE 流式） ============

  /**
   * 发送消息并流式产出 AI 回复分片（供 controller 转 SSE）。
   * 流程：校验会话/配额 → 落用户消息 → 组装上下文 → 调网关 chatStream 逐块 yield → 落 AI 消息 → 更新会话计数。
   * 始终以 done=true 分片收尾（controller 据此发 event:done）。
   */
  async *streamMessage(
    userId: string,
    convNo: string,
    content: string,
  ): AsyncGenerator<ChatStreamChunk> {
    const conv = await this.mustOwnConversation(userId, convNo);
    const conversationId = conv.id.toString();

    // T3-07 配额与轮次校验（抛 50001/50002，交由 SSE 层转 error 事件或过滤器）
    await this.guardQuota(userId, conv.roundCount);

    const nextRound = conv.roundCount + 1;

    // 落用户消息（Mongo）
    await this.writeMessage({
      conversationId,
      userId,
      roundNo: nextRound,
      role: MessageRole.USER,
      content,
      tokenCount: estimateTokens(content),
      model: null,
      createdAt: new Date(),
    });

    // T3-06 组装受控上下文（历史 + 本轮）
    const history = await this.readMessages(conversationId);
    const contextMessages = await this.context.buildContextMessages(conversationId, history);
    const messages = [
      { role: 'system' as const, content: AI_CHAT_SYSTEM_PROMPT },
      ...contextMessages,
    ];
    // 确保本轮 user 内容在末尾（readMessages 已含刚写入的用户消息，兜底再拼一次）
    if (messages[messages.length - 1]?.content !== content) {
      messages.push({ role: 'user' as const, content });
    }

    // 调网关流式出口，逐块转发
    let answer = '';
    let model: string | null = null;
    for await (const chunk of this.llm.chatStream({
      messages,
      traceId: conv.convNo,
      callerId: userId,
      scene: 'ai-chat',
    })) {
      if (chunk.delta) {
        answer += chunk.delta;
        yield { delta: chunk.delta, done: false, degraded: chunk.degraded, degradeReason: chunk.degradeReason };
      }
      if (chunk.done) {
        model = process.env.LLM_MODEL ?? 'mock-1';
      }
    }

    // 落 AI 回复消息（Mongo）
    await this.writeMessage({
      conversationId,
      userId,
      roundNo: nextRound,
      role: MessageRole.ASSISTANT,
      content: answer,
      tokenCount: estimateTokens(answer),
      model,
      createdAt: new Date(),
    });

    // 更新会话计数与状态（MySQL，降级不阻断收尾）
    await this.bumpConversation(conv.id, nextRound, estimateTokens(content) + estimateTokens(answer));

    // 收尾分片：done=true（controller 转 event:done）
    yield { delta: '', done: true };
  }

  /** 更新会话轮次/token/最后消息时间；达上限置 status=3。 */
  private async bumpConversation(id: bigint, roundCount: number, addToken: number): Promise<void> {
    const status = roundCount >= MAX_ROUND ? ConversationStatus.ROUND_LIMIT : ConversationStatus.ACTIVE;
    try {
      await this.prisma.aiConversation.update({
        where: { id },
        data: {
          roundCount,
          status,
          lastMsgAt: new Date(),
          tokenUsed: { increment: addToken },
        },
      });
    } catch (err) {
      this.logger.warn(`bump conversation degraded(blocked): ${(err as Error).message}`);
    }
  }
}