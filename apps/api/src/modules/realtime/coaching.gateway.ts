import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { TokenService } from '../user/auth/token.service';
import { BizCode } from '../../common/response';
import { CoachingMessageService } from './coaching-message.service';
import {
  ClientEvent,
  COACHING_NAMESPACE,
  MsgSenderRole,
  RELIABILITY,
  ServerEvent,
  ServerMessage,
  coachingRoom,
} from './realtime.constants';

/** 握手后附着在 socket.data 上的鉴权上下文 */
interface SocketAuth {
  userId: string;
  jti: string;
}

/** 待 ACK 消息的重发调度句柄 */
interface PendingAck {
  msg: ServerMessage;
  timer: NodeJS.Timeout;
  attempts: number;
}

/**
 * T4-05 / T4-06 · 辅导实时通信 WebSocket Gateway（Socket.IO）。
 *
 * namespace: /ws/coaching；transports: websocket + polling（长轮询降级，见 T4-06）。
 * WebSocket 通道不走 HTTP 响应拦截器，event 消息体自定义（{ ...ServerMessage } / { code,message } 等）。
 *
 * T4-05：
 *  - 握手鉴权：handleConnection 校验 JWT（复用 TokenService.verifyActive），未授权断开连接；
 *  - 房间模型：按 coachingSessionId 分房（coachingRoom），辅导师与用户加入同一 room 收发；
 *  - 消息落库：经 CoachingMessageService 落 Mongo（缺库降级内存，blocked），再向 room 广播（Redis Adapter 跨实例）。
 *
 * T4-06：
 *  - ACK 重发：下行消息带 seq，超时未收到客户端 coaching:ack 则重发（有限次数 MAX_RESEND）；
 *  - 断线补发：join 时携带 lastReceivedSeq，服务端按游标补发遗漏消息（coaching:replay）；
 *  - 长轮询降级：transports 含 polling（在 adapter 层配置），WebSocket 不可用时自动降级。
 */
@WebSocketGateway({ namespace: COACHING_NAMESPACE, transports: [...RELIABILITY.TRANSPORTS] })
export class CoachingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(CoachingGateway.name);

  @WebSocketServer()
  server!: Server;

  /** socketId → (serverMsgId → PendingAck)：等待客户端 ACK 的下行消息，用于超时重发 */
  private readonly pending = new Map<string, Map<string, PendingAck>>();

  constructor(
    private readonly tokenService: TokenService,
    private readonly messageService: CoachingMessageService,
  ) {}

  // ============ T4-05 握手鉴权 ============

  /**
   * 连接建立：握手阶段校验 JWT。
   * token 来源：handshake.auth.token 或 Authorization header（Bearer）。
   * 未授权 → 下发 error 事件并断开连接。
   */
  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    const payload = token ? await this.tokenService.verifyActive(token) : null;
    if (!payload || payload.typ !== 'access') {
      this.emitError(client, BizCode.WS_UNAUTHORIZED, '握手鉴权失败，请重新登录');
      client.disconnect(true);
      return;
    }
    (client.data as SocketAuth) = { userId: payload.sub, jti: payload.jti };
    this.logger.log(`ws connected: user=${payload.sub} sid=${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    // 清理该 socket 的待 ACK 重发定时器（断线后由重连补发接管）
    const bucket = this.pending.get(client.id);
    if (bucket) {
      for (const p of bucket.values()) clearTimeout(p.timer);
      this.pending.delete(client.id);
    }
    this.logger.log(`ws disconnected: sid=${client.id}`);
  }

  // ============ T4-05 加入房间 + T4-06 断线补发 ============

  /**
   * 加入辅导会话房间：校验房间归属（订单双方），加入 room；
   * 若客户端携带 lastReceivedSeq，则补发断线期间遗漏消息（T4-06）。
   */
  @SubscribeMessage(ClientEvent.JOIN)
  async onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { sessionId?: string; lastReceivedSeq?: number },
  ): Promise<void> {
    const auth = client.data as SocketAuth;
    const sessionId = String(body?.sessionId ?? '');
    if (!sessionId) {
      this.emitError(client, BizCode.WS_SESSION_INVALID, '缺少 sessionId');
      return;
    }
    try {
      const authz = await this.messageService.authorizeSession(sessionId, auth.userId);
      const room = coachingRoom(sessionId);
      await client.join(room);
      (client.data as SocketAuth & { sessionId?: string; senderRole?: MsgSenderRole }).sessionId =
        sessionId;
      (client.data as SocketAuth & { senderRole?: MsgSenderRole }).senderRole = authz.senderRole;

      const lastSeq = await this.messageService.currentSeq(sessionId);
      client.emit(ServerEvent.JOINED, { sessionId, room, lastSeq });

      // T4-06 断线补发：按客户端游标补齐遗漏
      const fromSeq = Number(body?.lastReceivedSeq ?? 0);
      if (fromSeq >= 0 && fromSeq < lastSeq) {
        const missed = await this.messageService.messagesAfter(sessionId, fromSeq);
        if (missed.length) {
          client.emit(ServerEvent.REPLAY, { fromSeq, messages: missed });
        }
      }
    } catch (err) {
      const code = (err as { bizCode?: number }).bizCode ?? BizCode.WS_ROOM_FORBIDDEN;
      this.emitError(client, code, (err as Error).message);
    }
  }

  // ============ T4-05 发送消息（落库 + 广播）+ T4-06 ACK ============

  /**
   * 发送消息：落库分配 seq → 向 room 广播（Redis Adapter 跨实例）→ 回执 ACK 给发送方 →
   * 对房间内其他成员启动 ACK 重发调度。
   */
  @SubscribeMessage(ClientEvent.MESSAGE)
  async onMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { sessionId?: string; clientMsgId?: string; content?: string },
  ): Promise<void> {
    const auth = client.data as SocketAuth & { sessionId?: string; senderRole?: MsgSenderRole };
    const sessionId = String(body?.sessionId ?? auth.sessionId ?? '');
    const clientMsgId = String(body?.clientMsgId ?? '');
    const content = String(body?.content ?? '');
    if (!sessionId || !clientMsgId || !content) {
      this.emitError(client, BizCode.WS_SESSION_INVALID, '消息参数不完整');
      return;
    }
    // 二次校验房间归属（防止未 join 直接发）
    const authz = await this.messageService.authorizeSession(sessionId, auth.userId);

    const msg = await this.messageService.appendMessage({
      sessionId,
      clientMsgId,
      senderId: auth.userId,
      senderRole: authz.senderRole,
      content,
    });

    const room = coachingRoom(sessionId);
    // 广播给房间所有成员（含发送方，便于多端同步）；跨实例经 Redis Adapter
    this.server.to(room).emit(ServerEvent.MESSAGE, msg);

    // 服务端 ACK 回执给发送方（clientMsgId → seq 映射，客户端据此确认已落库）
    client.emit(ServerEvent.ACK, {
      clientMsgId,
      seq: msg.seq,
      serverMsgId: msg.serverMsgId,
      ts: msg.ts,
    });

    // T4-06 对房间内“其他”成员启动 ACK 重发调度（消息不丢）
    this.scheduleResend(room, client.id, msg);
  }

  /**
   * 客户端确认收到某条下行消息（seq）：清除对应重发定时器。
   */
  @SubscribeMessage(ClientEvent.ACK)
  onAck(@ConnectedSocket() client: Socket, @MessageBody() body: { seq?: number }): void {
    const seq = Number(body?.seq ?? -1);
    const bucket = this.pending.get(client.id);
    if (!bucket) return;
    for (const [key, p] of bucket.entries()) {
      if (p.msg.seq === seq) {
        clearTimeout(p.timer);
        bucket.delete(key);
      }
    }
  }

  // ============ T4-06 ACK 重发调度 ============

  /**
   * 为房间内除发送方外的成员登记待 ACK 消息，超时未确认则重发，超过 MAX_RESEND 放弃（依赖断线补发兜底）。
   */
  private scheduleResend(room: string, senderSocketId: string, msg: ServerMessage): void {
    const sockets = this.roomSockets(room).filter((s) => s.id !== senderSocketId);
    for (const s of sockets) {
      const bucket = this.pending.get(s.id) ?? new Map<string, PendingAck>();
      const arm = (attempts: number): NodeJS.Timeout =>
        setTimeout(() => {
          if (attempts >= RELIABILITY.MAX_RESEND) {
            bucket.delete(msg.serverMsgId);
            return;
          }
          s.emit(ServerEvent.MESSAGE, msg);
          const entry = bucket.get(msg.serverMsgId);
          if (entry) {
            entry.attempts = attempts + 1;
            entry.timer = arm(attempts + 1);
          }
        }, RELIABILITY.ACK_TIMEOUT_MS);
      bucket.set(msg.serverMsgId, { msg, timer: arm(0), attempts: 0 });
      this.pending.set(s.id, bucket);
    }
  }

  /** 取房间内当前实例的 socket 列表（重发仅面向本实例连接，跨实例由各自实例调度）。 */
  private roomSockets(room: string): Socket[] {
    const result: Socket[] = [];
    const ids = this.server.sockets.adapter.rooms?.get(room);
    if (!ids) return result;
    for (const id of ids) {
      const s = this.server.sockets.sockets.get(id);
      if (s) result.push(s);
    }
    return result;
  }

  // ============ 工具 ============

  private extractToken(client: Socket): string {
    const authToken = (client.handshake.auth as { token?: string } | undefined)?.token;
    if (authToken) return String(authToken).replace(/^Bearer\s+/i, '');
    const header = client.handshake.headers['authorization'];
    return (Array.isArray(header) ? header[0] : header ?? '').replace(/^Bearer\s+/i, '');
  }

  private emitError(client: Socket, code: number, message: string): void {
    client.emit(ServerEvent.ERROR, { code, message });
  }
}