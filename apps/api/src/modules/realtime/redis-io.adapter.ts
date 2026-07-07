import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
import { RELIABILITY } from './realtime.constants';

/**
 * T4-05 · Socket.IO 广播适配器（单实例内存广播）。
 *
 * 已移除 Redis(@socket.io/redis-adapter / ioredis) 依赖：本项目改为 MySQL 持久化、
 * 单实例部署，Socket.IO 使用默认的 in-memory adapter 完成同实例广播。
 *
 * ── 多副本部署提示 ──
 * 若未来横向扩展为多副本，需在网关层（Nginx / Ingress / SLB）配置 ip_hash 粘性会话，
 * 并重新引入跨实例广播方案（如 socket.io 官方的其他 adapter）。当前单实例无需此配置。
 * 详见《阶段4-人工调试待办清单.md》。
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  /** 保留字段：当前恒为单实例内存广播 */
  private readonly redisReady = false;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  /** 兼容旧调用：不再连接 Redis，仅记录使用内存广播 */
  async connectToRedis(): Promise<void> {
    this.logger.log('Socket.IO using single-instance in-memory broadcast (Redis removed)');
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    return super.createIOServer(port, {
      ...options,
      // T4-06 长轮询降级：允许 polling 作为 websocket 不可用时的兜底通道
      transports: [...RELIABILITY.TRANSPORTS],
      // 允许 CORS（生产按需收敛）
      cors: { origin: true, credentials: true },
    });
  }

  isRedisReady(): boolean {
    return this.redisReady;
  }
}