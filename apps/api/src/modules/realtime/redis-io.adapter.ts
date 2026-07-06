import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { RELIABILITY } from './realtime.constants';

/**
 * T4-05 · Socket.IO 多实例广播适配器（Redis Adapter）。
 *
 * 接入 @socket.io/redis-adapter 实现多实例消息广播（pub/sub）。
 * 无 Redis 实例时降级为单实例内存广播（socket.io 默认 in-memory adapter），并标 blocked。
 *
 * ── ip-hash 粘性会话（sticky session）部署约定 ──
 * WebSocket / socket.io 长连接要求同一客户端的握手与后续 polling 请求命中同一后端实例，
 * 否则 polling 升级 websocket 会失败。生产多副本部署需在网关层（Nginx / Ingress / SLB）
 * 配置 ip_hash（或基于连接的粘性负载均衡）实现粘性路由：
 *   - Nginx:  upstream ws_backend { ip_hash; server ... }
 *   - K8s Ingress:  nginx.ingress.kubernetes.io/upstream-hash-by: "$binary_remote_addr"
 * 该项属运维配置，代码侧仅通过 Redis Adapter 保证跨实例广播一致性。
 * 详见《阶段4-人工调试待办清单.md》。
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  /** 是否已成功接入 Redis 多实例广播（false 表示降级单实例，blocked） */
  private redisReady = false;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  /**
   * 尝试连接 Redis 并构建 pub/sub adapter。
   * 连接失败（无实例）时不抛出，保持 adapterConstructor=null → 降级单实例内存广播。
   */
  async connectToRedis(): Promise<void> {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379/0';
    try {
      const pubClient = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      const subClient = pubClient.duplicate();
      // 显连接以便捕获无实例场景，避免启动阻塞
      await pubClient.connect();
      await subClient.connect();
      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.redisReady = true;
      this.logger.log('Socket.IO Redis adapter connected (multi-instance broadcast)');
    } catch (err) {
      this.redisReady = false;
      this.adapterConstructor = null;
      this.logger.warn(
        `Socket.IO Redis adapter degraded to single-instance in-memory broadcast (blocked): ${(err as Error).message}`,
      );
    }
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, {
      ...options,
      // T4-06 长轮询降级：允许 polling 作为 websocket 不可用时的兜底通道
      transports: [...RELIABILITY.TRANSPORTS],
      // 允许 CORS（生产按需收敛）
      cors: { origin: true, credentials: true },
    }) as { adapter?: (a: unknown) => void };

    if (this.adapterConstructor) {
      server.adapter?.(this.adapterConstructor);
    }
    return server;
  }

  isRedisReady(): boolean {
    return this.redisReady;
  }
}