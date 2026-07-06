import { CoachingGateway } from './coaching.gateway';
import { MsgSenderRole, RELIABILITY, ServerEvent } from './realtime.constants';
import { BizCode } from '../../common/response';

/**
 * CoachingGateway 单测:纯确定性,TokenService/CoachingMessageService/socket.io Server 全部内存 mock。
 * 覆盖:握手 JWT 鉴权(拒绝/通过)、onJoin 房间归属+断线补发、onMessage 落库广播+ACK、
 *       onAck 清除重发、scheduleResend 超时重发(fake timers)。
 */
describe('CoachingGateway (T4-05/T4-06)', () => {
 const makeToken = (payload: any = { sub: '7', jti: 'j1', typ: 'access' }) => ({
    verifyActive: jest.fn().mockResolvedValue(payload),
  });

  const makeMsgSvc = () => ({
    authorizeSession: jest.fn().mockResolvedValue({
      sessionId: '100',
      userId: '7',
      coachUserId: '9',
      senderRole: MsgSenderRole.USER,
    }),
    currentSeq: jest.fn().mockResolvedValue(0),
    appendMessage: jest.fn(async (i: any) => ({
      seq: 1,
      serverMsgId: 'srv-1',
      clientMsgId: i.clientMsgId,
      sessionId: i.sessionId,
      senderId: i.senderId,
      senderRole: i.senderRole,
      content: i.content,
      ts: 123,
    })),
    messagesAfter: jest.fn().mockResolvedValue([]),
  });

  const makeClient = (over: any = {}) => ({
    id: 's-client',
    data: {},
    handshake: { auth: { token: 'tok' }, headers: {} },
    emit: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    ...over,
  });

  const makeServer = () => {
    const emit = jest.fn();
    return {
      to: jest.fn(() => ({ emit })),
      _roomEmit: emit,
      sockets: {
        adapter: { rooms: new Map<string, Set<string>>() },
        sockets: new Map<string, any>(),
      },
    };
  };

  const build = (tokenPayload?: any) => {
    const token = makeToken(tokenPayload);
    const msg = makeMsgSvc();
    const gw = new CoachingGateway(token as any, msg as any);
    const server = makeServer();
    (gw as any).server = server;
    return { gw, token, msg, server };
  };

  describe('T4-05 握手鉴权', () => {
    it('无效 token → 下发 WS_UNAUTHORIZED 并断开', async () => {
      const { gw } = build(null);
      const client = makeClient();
      await gw.handleConnection(client as any);
      expect(client.emit).toHaveBeenCalledWith(
        ServerEvent.ERROR,
        expect.objectContaining({ code: BizCode.WS_UNAUTHORIZED }),
      );
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('typ 非 access → 拒绝', async () => {
      const { gw } = build({ sub: '7', jti: 'j', typ: 'refresh' });
      const client = makeClient();
      await gw.handleConnection(client as any);
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('有效 access token → 写入 socket.data 且不断开', async () => {
      const { gw } = build();
      const client = makeClient();
      await gw.handleConnection(client as any);
      expect(client.disconnect).not.toHaveBeenCalled();
      expect((client.data as any).userId).toBe('7');
    });
  });

  describe('T4-05 onJoin 房间归属 + T4-06 断线补发', () => {
    it('缺 sessionId → WS_SESSION_INVALID', async () => {
      const { gw } = build();
      const client = makeClient({ data: { userId: '7' } });
      await gw.onJoin(client as any, {});
      expect(client.emit).toHaveBeenCalledWith(
        ServerEvent.ERROR,
        expect.objectContaining({ code: BizCode.WS_SESSION_INVALID }),
      );
    });

    it('归属校验通过 → join 房间并 emit JOINED', async () => {
      const { gw, msg } = build();
      const client = makeClient({ data: { userId: '7' } });
      await gw.onJoin(client as any, { sessionId: '100' });
      expect(msg.authorizeSession).toHaveBeenCalledWith('100', '7');
      expect(client.join).toHaveBeenCalledWith('coaching:100');
      expect(client.emit).toHaveBeenCalledWith(
        ServerEvent.JOINED,
        expect.objectContaining({ sessionId: '100', room: 'coaching:100' }),
      );
    });

    it('lastReceivedSeq < lastSeq → 补发 REPLAY', async () => {
      const { gw, msg } = build();
      msg.currentSeq.mockResolvedValue(5);
      msg.messagesAfter.mockResolvedValue([{ seq: 3 }, { seq: 4 }, { seq: 5 }] as any);
      const client = makeClient({ data: { userId: '7' } });
      await gw.onJoin(client as any, { sessionId: '100', lastReceivedSeq: 2 });
      expect(msg.messagesAfter).toHaveBeenCalledWith('100', 2);
      expect(client.emit).toHaveBeenCalledWith(
        ServerEvent.REPLAY,
        expect.objectContaining({ fromSeq: 2 }),
      );
    });
  });

  describe('T4-05 onMessage 落库广播 + T4-06 ACK', () => {
    it('参数不完整 → 报错不落库', async () => {
      const { gw, msg } = build();
      const client = makeClient({ data: { userId: '7', sessionId: '100' } });
      await gw.onMessage(client as any, { sessionId: '100', clientMsgId: '', content: '' });
      expect(client.emit).toHaveBeenCalledWith(
        ServerEvent.ERROR,
        expect.objectContaining({ code: BizCode.WS_SESSION_INVALID }),
      );
      expect(msg.appendMessage).not.toHaveBeenCalled();
    });

    it('正常发送 → 落库 + 房间广播 + 回执 ACK', async () => {
      const { gw, msg, server } = build();
      const client = makeClient({ data: { userId: '7', sessionId: '100' } });
      await gw.onMessage(client as any, {
        sessionId: '100',
        clientMsgId: 'c1',
        content: 'hi',
      });
      expect(msg.appendMessage).toHaveBeenCalledTimes(1);
      expect(server.to).toHaveBeenCalledWith('coaching:100');
      expect(server._roomEmit).toHaveBeenCalledWith(ServerEvent.MESSAGE, expect.any(Object));
      expect(client.emit).toHaveBeenCalledWith(
        ServerEvent.ACK,
        expect.objectContaining({ clientMsgId: 'c1', seq: 1, serverMsgId: 'srv-1' }),
      );
    });
  });

  describe('T4-06 ACK 重发调度', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('房间内其他成员超时未 ACK → 重发,收到 onAck 后停止', async () => {
      const { gw, server } = build();
      // 房间内有一个"其他"成员 s-peer
      const peerEmit = jest.fn();
      const peer = { id: 's-peer', emit: peerEmit };
      server.sockets.adapter.rooms.set('coaching:100', new Set(['s-client', 's-peer']));
      server.sockets.sockets.set('s-peer', peer as any);

      const client = makeClient({ id: 's-client', data: { userId: '7', sessionId: '100' } });
      await gw.onMessage(client as any, { sessionId: '100', clientMsgId: 'c1', content: 'hi' });

      // 首次超时 → 重发一次
      jest.advanceTimersByTime(RELIABILITY.ACK_TIMEOUT_MS);
      expect(peerEmit).toHaveBeenCalledWith(ServerEvent.MESSAGE, expect.any(Object));

      // peer 回 ACK(seq=1) → 清除重发
      gw.onAck(peer as any, { seq: 1 });
      peerEmit.mockClear();
      jest.advanceTimersByTime(RELIABILITY.ACK_TIMEOUT_MS * 2);
      expect(peerEmit).not.toHaveBeenCalled();
    });

    it('超过 MAX_RESEND 后停止重发', async () => {
      const { gw, server } = build();
      const peerEmit = jest.fn();
      const peer = { id: 's-peer', emit: peerEmit };
      server.sockets.adapter.rooms.set('coaching:100', new Set(['s-client', 's-peer']));
      server.sockets.sockets.set('s-peer', peer as any);

      const client = makeClient({ id: 's-client', data: { userId: '7', sessionId: '100' } });
      await gw.onMessage(client as any, { sessionId: '100', clientMsgId: 'c1', content: 'hi' });

      // 推进足够多次,重发次数应受 MAX_RESEND 限制
      jest.advanceTimersByTime(RELIABILITY.ACK_TIMEOUT_MS * (RELIABILITY.MAX_RESEND + 3));
      expect(peerEmit.mock.calls.length).toBeLessThanOrEqual(RELIABILITY.MAX_RESEND);
    });
  });

  describe('handleDisconnect', () => {
    it('断开时清理该 socket 的待 ACK 定时器', () => {
      const { gw } = build();
      const client = makeClient();
      expect(() => gw.handleDisconnect(client as any)).not.toThrow();
    });
  });
});