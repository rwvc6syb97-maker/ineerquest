import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Collection } from 'mongodb';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MongoService } from '../../infra/mongo/mongo.service';
import { BizCode, BizException } from '../../common/response';
import {
  COACHING_MESSAGE_COLLECTION,
  CoachingMessageDoc,
  MsgSenderRole,
  RELIABILITY,
  ServerMessage,
} from './realtime.constants';

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
 * 消息流存储策略与阶段3 ai_message 保持一致：消息落 MongoDB（集合 coaching_message），
 * 缺 Mongo 时降级为进程内内存态（blocked，不落库不阻断，单实例可读补发）。
 * seq 游标按 sessionId 单调递增，供 T4-06 断线补发对齐。
 *
 * 会话房间归属：按 CoachingSession → CoachingOrder 关联校验 userId / coachId，
 * 仅订单双方可进入房间；缺 MySQL 时降级放行并标 blocked（见待办清单）。
 */
@Injectable()
export class CoachingMessageService {
  private readonly logger = new Logger(CoachingMessageService.name);

  /** 内存兜底：sessionId → 消息列表（Mongo 不可用时的单实例存储） */
  private readonly memStore = new Map<string, ServerMessage[]>();
  /** 内存兜底：sessionId → 当前最大 seq */
  private readonly memSeq = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mongo: MongoService,
  ) {}

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

  // ============ Mongo 消息流读写（降级安全） ============

  private collection(): Collection<CoachingMessageDoc> | null {
    try {
      return this.mongo.getDb().collection<CoachingMessageDoc>(COACHING_MESSAGE_COLLECTION);
    } catch (err) {
      this.logger.warn(`mongo coaching message store degraded(blocked): ${(err as Error).message}`);
      return null;
    }
  }

  /** 取会话当前最大 seq（游标）。Mongo 不可用时读内存态。 */
  async currentSeq(sessionId: string): Promise<number> {
    const col = this.collection();
    if (!col) {
      return this.memSeq.get(sessionId) ?? 0;
    }
    try {
      const last = await col.find({ sessionId }).sort({ seq: -1 }).limit(1).toArray();
      return last.length ? last[0].seq : 0;
    } catch (err) {
      this.logger.warn(`currentSeq degraded(blocked): ${(err as Error).message}`);
      return this.memSeq.get(sessionId) ?? 0;
    }
  }

  /**
   * 落库一条消息并分配 seq（服务端权威游标）。
   * 返回统一的 ServerMessage（用于广播 + ACK 回执）。
   * Mongo 不可用时写内存态（blocked，不阻断）。
   */
  async appendMessage(input: {
    sessionId: string;
    clientMsgId: string;
    senderId: string;
    senderRole: MsgSenderRole;
    content: string;
  }): Promise<ServerMessage> {
    const seq = (await this.currentSeq(input.sessionId)) + 1;
    const msg: ServerMessage = {
      seq,
      serverMsgId: randomUUID(),
      clientMsgId: input.clientMsgId,
      sessionId: input.sessionId,
      senderId: input.senderId,
      senderRole: input.senderRole,
      content: input.content,
      ts: Date.now(),
    };

    const col = this.collection();
    if (col) {
      try {
        await col.insertOne({ ...msg });
        await this.bumpMsgCount(input.sessionId);
        return msg;
      } catch (err) {
        this.logger.warn(`appendMessage degraded(blocked): ${(err as Error).message}`);
      }
    }
    // 内存兜底
    const list = this.memStore.get(input.sessionId) ?? [];
    list.push(msg);
    this.memStore.set(input.sessionId, list);
    this.memSeq.set(input.sessionId, seq);
    return msg;
  }

  /**
   * T4-06 断线补发：拉取 seq > fromSeq 的遗漏消息（有上限，避免风暴）。
   * Mongo 不可用时读内存态。
   */
  async messagesAfter(sessionId: string, fromSeq: number): Promise<ServerMessage[]> {
    const col = this.collection();
    if (!col) {
      const list = this.memStore.get(sessionId) ?? [];
      return list.filter((m) => m.seq > fromSeq).slice(0, RELIABILITY.MAX_REPLAY);
    }
    try {
      const docs = await col
        .find({ sessionId, seq: { $gt: fromSeq } })
        .sort({ seq: 1 })
        .limit(RELIABILITY.MAX_REPLAY)
        .toArray();
      return docs.map((d) => ({
        seq: d.seq,
        serverMsgId: d.serverMsgId,
        clientMsgId: d.clientMsgId,
        sessionId: d.sessionId,
        senderId: d.senderId,
        senderRole: d.senderRole,
        content: d.content,
        ts: d.ts,
      }));
    } catch (err) {
      this.logger.warn(`messagesAfter degraded(blocked): ${(err as Error).message}`);
      const list = this.memStore.get(sessionId) ?? [];
      return list.filter((m) => m.seq > fromSeq).slice(0, RELIABILITY.MAX_REPLAY);
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