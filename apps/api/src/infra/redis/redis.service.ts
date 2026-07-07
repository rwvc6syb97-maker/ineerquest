import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MysqlKvClient } from './mysql-kv.client';

/**
 * RedisService — 缓存 / 限流 / 配额 / 分布式锁基础设施。
 *
 * 已彻底移除 Redis/ioredis 依赖，底层改由 MySQL(cache_kv / cache_zset) 持久化实现。
 * `raw` 暴露与 ioredis 原生客户端兼容的子集接口，业务代码 `redis.raw.xxx()` 无需改动。
 * 数据真正持久化，进程重启不丢失（黑名单、限流、验证码、延迟队列等）。
 */
@Injectable()
export class RedisService {
  private readonly client: MysqlKvClient;

  constructor(private readonly prisma: PrismaService) {
    this.client = new MysqlKvClient(this.prisma);
  }

  /** 兼容 ioredis 原生客户端接口的 MySQL KV 客户端 */
  get raw(): MysqlKvClient {
    return this.client;
  }

  /**
   * 令牌桶限流（替代原 Lua eval 实现）。
   * @returns 允许返回 true，拒绝返回 false
   */
  async tokenBucket(
    key: string,
    capacity: number,
    refillPerSec: number,
    ttlSec: number,
  ): Promise<boolean> {
    const allowed = await this.client.tokenBucket(key, capacity, refillPerSec, ttlSec);
    return allowed === 1;
  }

  /** 健康探针：DB 可达返回 true */
  async ping(): Promise<boolean> {
    try {
      const res = await this.client.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }
}