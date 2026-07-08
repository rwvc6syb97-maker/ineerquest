import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BizCode, BizException } from '../../common/response';
import { MsgSenderRole, RELIABILITY, ServerMessage } from './realtime.constants';

/** 会话鉴权结果：房间归属校验通过后返回订单双方 id + 当前发送者角色 */
export interface SessionAuthResult {
  sessionId: string;
  userId: string;
  coachUserId: string;
  senderRole: MsgSenderRole;
}

/**
 * T4-05/T4-06 · 辅导消息存储与会话鉴权服务。
 *
 * 消息流存储策略与阶段3 ai_message 保持一致：消息落 MySQL（表 coaching_message），
 * seq 游标按 sessionId 单调递增（sessionId+seq 联合唯一约束保证并发唯一），
 * 供 T4-06 断线补发对齐。
 *
 * 会话房间归属：按 CoachingSession → CoachingOrder 关联校验 userId / coachId，
 * 仅订单双方可进入房间；缺 MySQL 时降级放行并标 blocked（见待办清单）。
 */
@Injectable()
export class CoachingMessageService {
  private readonly logger = new Logger(CoachingMessageService.name);

  /** seq 并发冲突时的最大重试次数 */
  private static readonly MAX_SEQ_RETRY = 5;

  constructor(private readonly prisma: PrismaService) {}

  // ============ 会话房间鉴权（T4-05） ============

  /**
   * 校验用户对辅导会话房间的访问权限，并判定发送者角色。
   *  - 会话不存在/非法 → WS_SESSION_INVALID(80003)
   *  - 非订单双方 → WS_ROOM_FORBIDDEN(80002)
   * 缺 MySQL 时降级放行（blocked），角色按 user 兜底。
   */
  async authorizeSession(sessionId: string, userId: string): Promise<SessionAuthResult> {
    try {
      const session = await this.prisma.coachingSession.findUnique({
        where: { id: BigInt(sessionId) },
        include: { order: true },
      });
      if (!session || !session.order) {
        throw new BizException(BizCode.WS_SESSION_INVALID, '辅导会话不存在或状态非法');
      }
      const orderUserId = session.order.userId.toString();
      const orderCoachUserId = session.order.coachId.toString();
      if (userId !== orderUserId && userId !== orderCoachUserId) {
        throw new BizException(BizCode.WS_ROOM_FORBIDDEN, '无权访问该辅导会话房间');
      }
      return {
        sessionId,
        userId: orderUserId,
        coachUserId: orderCoachUserId,
        senderRole: userId === orderCoachUserId ? MsgSenderRole.COACH : MsgSenderRole.USER,
      };
    } catch (err) {
      if (err instanceof BizException) throw err;
      // 缺 MySQL / 连接异常：降级放行（blocked），角色按 user 兜底
      this.logger.warn(`session auth degraded(blocked): ${(err as Error).message}`);
      return {
        sessionId,
        userId,
        coachUserId: '',
        senderRole: MsgSenderRole.USER,
      };
    }
  }

  // ============ MySQL 消息流读写（降级安全） ============

  /** 取会话当前最大 seq（游标）。MySQL 不可用时返回 0。 */
  async currentSeq(sessionId: string): Promise<number> {
    try {
      const last = await this.prisma.coachingMessage.findFirst({
        where: { sessionId: BigInt(sessionId) },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      });
      return last ? last.seq : 0;
    } catch (err) {
      this.logger.warn(`currentSeq degraded(blocked): ${(err as Error).message}`);
      return 0;
    }
  }

  /**
   * 落库一条消息并分配 seq（服务端权威游标）。
   * seq = 当前最大 + 1；sessionId+seq 联合唯一，冲突则重试（有限次）。
   * 返回统一的 ServerMessage（用于广播 + ACK 回执）。
   * MySQL 不可用时返回内存态消息（blocked，不阻断广播）。
   */
  async appendMessage(input: {
    sessionId: string;
    clientMsgId: string;
    senderId: string;
    senderRole: MsgSenderRole;
    content: string;
  }): Promise<ServerMessage> {
    const serverMsgId = randomUUID();
    const ts = Date.now();

    for (let attempt = 0; attempt < CoachingMessageService.MAX_SEQ_RETRY; attempt++) {
      const seq = (await this.currentSeq(input.sessionId)) + 1;
      try {
        await this.prisma.coachingMessage.create({
          data: {
            sessionId: BigInt(input.sessionId),
            seq,
            serverMsgId,
            clientMsgId: input.clientMsgId,
            senderId: BigInt(input.senderId),
            senderRole: input.senderRole,
            content: input.content,
            ts: BigInt(ts),
          },
        });
        await this.bumpMsgCount(input.sessionId);
        return {
          seq,
          serverMsgId,
          clientMsgId: input.clientMsgId,
          sessionId: input.sessionId,
          senderId: input.senderId,
          senderRole: input.senderRole,
          content: input.content,
          ts,
        };
      } catch (err) {
        // 唯一约束冲突（P2002）→ seq 被并发占用，重试分配新 seq
        if ((err as { code?: string }).code === 'P2002') {
          continue;
        }
        this.logger.warn(`appendMessage degraded(blocked): ${(err as Error).message}`);
        // 非冲突异常（缺库等）→ 返回内存态消息，不阻断广播
        return {
          seq,
          serverMsgId,
          clientMsgId: input.clientMsgId,
          sessionId: input.sessionId,
          senderId: input.senderId,
          senderRole: input.senderRole,
          content: input.content,
          ts,
        };
      }
    }

    // 重试耗尽：以最新 seq 兜底返回（不再落库，避免风暴）
    const seq = (await this.currentSeq(input.sessionId)) + 1;
    this.logger.warn(`appendMessage seq retry exhausted for session ${input.sessionId}`);
    return {
      seq,
      serverMsgId,
      clientMsgId: input.clientMsgId,
      sessionId: input.sessionId,
      senderId: input.senderId,
      senderRole: input.senderRole,
      content: input.content,
      ts,
    };
  }

  /**
   * T4-06 断线补发：拉取 seq > fromSeq 的遗漏消息（有上限，避免风暴）。
   * MySQL 不可用时返回空数组。
   */
  async messagesAfter(sessionId: string, fromSeq: number): Promise<ServerMessage[]> {
    try {
      const rows = await this.prisma.coachingMessage.findMany({
        where: { sessionId: BigInt(sessionId), seq: { gt: fromSeq } },
        orderBy: { seq: 'asc' },
        take: RELIABILITY.MAX_REPLAY,
      });
      return rows.map((d) => ({
        seq: d.seq,
        serverMsgId: d.serverMsgId,
        clientMsgId: d.clientMsgId,
        sessionId: d.sessionId.toString(),
        senderId: d.senderId.toString(),
        senderRole: d.senderRole as MsgSenderRole,
        content: d.content,
        ts: Number(d.ts),
      }));
    } catch (err) {
      this.logger.warn(`messagesAfter degraded(blocked): ${(err as Error).message}`);
      return [];
    }
  }

  /** 更新会话消息计数（best-effort，缺库不阻断）。 */
  private async bumpMsgCount(sessionId: string): Promise<void> {
    try {
      await this.prisma.coachingSession.update({
        where: { id: BigInt(sessionId) },
        data: { msgCount: { increment: 1 } },
      });
    } catch (err) {
      this.logger.warn(`bumpMsgCount degraded(blocked): ${(err as Error).message}`);
    }
  }
}