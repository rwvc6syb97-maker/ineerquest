import { Module } from '@nestjs/common';
import { RealtimeController } from './realtime.controller';
import { CoachingGateway } from './coaching.gateway';
import { CoachingMessageService } from './coaching-message.service';

/**
 * 实时通信服务（T4-05~T4-06）：辅导会话 WebSocket（Socket.IO Gateway，namespace /ws/coaching）。
 *  - 握手 JWT 鉴权、按 coachingSessionId 分房、消息落库（Mongo/内存兜底）+ 房间广播；
 *  - Redis Adapter 多实例广播（无 Redis 降级单实例，见 redis-io.adapter.ts + main.ts）；
 *  - ACK 重发 / 断线补发 / 长轮询降级。
 * TokenService(AuthModule) 与 Prisma/Mongo(InfraModule) 均为全局提供。
 */
@Module({
  controllers: [RealtimeController],
  providers: [CoachingGateway, CoachingMessageService],
})
export class RealtimeModule {}