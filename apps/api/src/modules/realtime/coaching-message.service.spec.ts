import { CoachingMessageService } from './coaching-message.service';
import { MsgSenderRole } from './realtime.constants';
import { BizCode, BizException } from '../../common/response';

/**
 * CoachingMessageService 单测:纯确定性,Prisma 全部内存 mock 替身,无网络/DB 依赖。
 * 覆盖:会话鉴权(归属/非法/越权/缺 MySQL 降级)、seq 游标分配、断线补发过滤、缺库降级兜底。
 */
describe('CoachingMessageService (T4-05/T4-06)', () => {
  const makeSession = (userId: bigint, coachId: bigint) => ({
    id: 100n,
    order: { userId, coachId },
  });

  /**
   * Prisma mock:coachingMessage 用内存数组模拟 sessionId+seq 存储,
   * findFirst 取最大 seq、findMany 过滤断线补发、create 落库。
   */
  const build = (opts: { prisma?: any; dbDown?: boolean } = {}) => {
    const store: any[] = [];
    const prisma: any = {
      coachingSession: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      coachingMessage: {
        findFirst: jest.fn(async ({ where }: any) => {
          if (opts.dbDown) throw new Error('db down');
          const list = store
            .filter((m) => m.sessionId === where.sessionId.toString())
            .sort((a, b) => b.seq - a.seq);
          return list.length ? { seq: list[0].seq } : null;
        }),
        findMany: jest.fn(async ({ where }: any) => {
          if (opts.dbDown) throw new Error('db down');
          return store
            .filter((m) => m.sessionId === where.sessionId.toString() && m.seq > where.seq.gt)
            .sort((a, b) => a.seq - b.seq)
            .map((m) => ({
              ...m,
              sessionId: BigInt(m.sessionId),
              senderId: BigInt(m.senderId),
              ts: BigInt(m.ts),
            }));
        }),
        create: jest.fn(async ({ data }: any) => {
          if (opts.dbDown) throw new Error('db down');
          store.push({ ...data, sessionId: data.sessionId.toString(), senderId: data.senderId.toString(), ts: Number(data.ts) });
          return {};
        }),
      },
      ...(opts.prisma ?? {}),
    };
    const svc = new CoachingMessageService(prisma);
    return { svc, prisma, store };
  };

  describe('authorizeSession 会话鉴权 (T4-05)', () => {
    it('用户为订单 user 时通过,角色判定为 USER', async () => {
      const { svc, prisma } = build();
      prisma.coachingSession.findUnique.mockResolvedValue(makeSession(7n, 9n));
      const r = await svc.authorizeSession('100', '7');
      expect(r.senderRole).toBe(MsgSenderRole.USER);
      expect(r.userId).toBe('7');
      expect(r.coachUserId).toBe('9');
    });

    it('用户为订单 coach 时通过,角色判定为 COACH', async () => {
      const { svc, prisma } = build();
      prisma.coachingSession.findUnique.mockResolvedValue(makeSession(7n, 9n));
      const r = await svc.authorizeSession('100', '9');
      expect(r.senderRole).toBe(MsgSenderRole.COACH);
    });

    it('会话不存在 → WS_SESSION_INVALID(80003)', async () => {
      const { svc, prisma } = build();
      prisma.coachingSession.findUnique.mockResolvedValue(null);
      await expect(svc.authorizeSession('100', '7')).rejects.toMatchObject({
        bizCode: BizCode.WS_SESSION_INVALID,
      });
    });

    it('非订单双方 → WS_ROOM_FORBIDDEN(80002)', async () => {
      const { svc, prisma } = build();
      prisma.coachingSession.findUnique.mockResolvedValue(makeSession(7n, 9n));
      await expect(svc.authorizeSession('100', '999')).rejects.toBeInstanceOf(BizException);
      await expect(svc.authorizeSession('100', '999')).rejects.toMatchObject({
        bizCode: BizCode.WS_ROOM_FORBIDDEN,
      });
    });

    it('缺 MySQL(查询抛错) → 降级放行(blocked),角色兜底 USER', async () => {
      const { svc, prisma } = build();
      prisma.coachingSession.findUnique.mockRejectedValue(new Error('db down'));
      const r = await svc.authorizeSession('100', '7');
      expect(r.senderRole).toBe(MsgSenderRole.USER);
      expect(r.userId).toBe('7');
    });
  });

  describe('appendMessage + currentSeq + messagesAfter (MySQL 存储路径)', () => {
    it('落库并分配 seq,单调递增,bumpMsgCount', async () => {
      const { svc, prisma } = build();
      const m1 = await svc.appendMessage({
        sessionId: '100',
        clientMsgId: 'c1',
        senderId: '7',
        senderRole: MsgSenderRole.USER,
        content: 'hello',
      });
      const m2 = await svc.appendMessage({
        sessionId: '100',
        clientMsgId: 'c2',
        senderId: '7',
        senderRole: MsgSenderRole.USER,
        content: 'world',
      });
      expect(m1.seq).toBe(1);
      expect(m2.seq).toBe(2);
      expect(m1.serverMsgId).toBeTruthy();
      expect(await svc.currentSeq('100')).toBe(2);
      expect(prisma.coachingSession.update).toHaveBeenCalledTimes(2);
    });

    it('messagesAfter 只返回 seq > fromSeq 的消息(断线补发)', async () => {
      const { svc } = build();
      for (const c of ['c1', 'c2', 'c3']) {
        await svc.appendMessage({
          sessionId: '200',
          clientMsgId: c,
          senderId: '7',
          senderRole: MsgSenderRole.USER,
          content: c,
        });
      }
      const missed = await svc.messagesAfter('200', 1);
expect(missed.map((m) => m.seq)).toEqual([2, 3]);
    });

    it('缺 MySQL 时 currentSeq 返回 0、messagesAfter 返回空数组(降级)', async () => {
      const { svc } = build({ dbDown: true });
      expect(await svc.currentSeq('300')).toBe(0);
      expect(await svc.messagesAfter('300', 0)).toEqual([]);
    });
  });
});