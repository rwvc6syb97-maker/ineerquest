import { CoachingMessageService } from './coaching-message.service';
import { MsgSenderRole } from './realtime.constants';
import { BizCode, BizException } from '../../common/response';

/**
 * CoachingMessageService 单测:纯确定性,Prisma/Mongo 全部内存 mock 替身,无网络/DB 依赖。
 * 覆盖:会话鉴权(归属/非法/越权/缺 MySQL 降级)、seq 游标分配、断线补发过滤、Mongo 缺失内存兜底。
 */
describe('CoachingMessageService (T4-05/T4-06)', () => {
  const makeSession = (userId: bigint, coachId: bigint) => ({
    id: 100n,
    order: { userId, coachId },
  });

  const build = (opts: { prisma?: any; mongoThrows?: boolean } = {}) => {
    const prisma: any = {
      coachingSession: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      ...(opts.prisma ?? {}),
    };
    const mongo: any = {
      getDb: jest.fn(() => {
        if (opts.mongoThrows) throw new Error('mongo down');
        return { collection: jest.fn(() => collection) };
      }),
    };
    const collection: any = {
      find: jest.fn(),
      insertOne: jest.fn().mockResolvedValue({}),
    };
    const svc = new CoachingMessageService(prisma, mongo);
    return { svc, prisma, mongo, collection };
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

  describe('appendMessage + currentSeq + messagesAfter (内存兜底路径)', () => {
    it('Mongo 缺失时写内存态,seq 单调递增', async () => {
      const { svc } = build({ mongoThrows: true });
      const m1 = await svc.appendMessage({
        sessionId: 's1',
        clientMsgId: 'c1',
        senderId: '7',
        senderRole: MsgSenderRole.USER,
        content: 'hello',
      });
      const m2 = await svc.appendMessage({
        sessionId: 's1',
        clientMsgId: 'c2',
        senderId: '7',
        senderRole: MsgSenderRole.USER,
        content: 'world',
      });
      expect(m1.seq).toBe(1);
      expect(m2.seq).toBe(2);
      expect(m1.serverMsgId).toBeTruthy();
      expect(await svc.currentSeq('s1')).toBe(2);
    });

    it('messagesAfter 只返回 seq > fromSeq 的消息(断线补发)', async () => {
      const { svc } = build({ mongoThrows: true });
      for (const c of ['c1', 'c2', 'c3']) {
        await svc.appendMessage({
          sessionId: 's2',
          clientMsgId: c,
          senderId: '7',
          senderRole: MsgSenderRole.USER,
          content: c,
        });
      }
      const missed = await svc.messagesAfter('s2', 1);
      expect(missed.map((m) => m.seq)).toEqual([2, 3]);
    });

    it('Mongo 可用时落库并 bumpMsgCount', async () => {
      const { svc, prisma, collection } = build();
      collection.find.mockReturnValue({
        sort: () => ({ limit: () => ({ toArray: async () => [] }) }),
      });
      const m = await svc.appendMessage({
        sessionId: '100',
        clientMsgId: 'c1',
        senderId: '7',
        senderRole: MsgSenderRole.USER,
        content: 'hi',
      });
      expect(m.seq).toBe(1);
      expect(collection.insertOne).toHaveBeenCalledTimes(1);
      expect(prisma.coachingSession.update).toHaveBeenCalledTimes(1);
    });
  });
});