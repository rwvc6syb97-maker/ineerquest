import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * MysqlKvClient — 基于 MySQL(cache_kv / cache_zset) 的持久化 KV 存储，
 * 对外暴露与 ioredis 原生客户端兼容的子集接口，供业务代码 `redis.raw.xxx()` 无缝调用。
 *
 * 支持能力：
 *  - 字符串/计数/TTL：get / set(EX|PX|NX 变体) / del / ttl / expire / incr / decr
 *  - 有序集合：zadd / zremrangebyscore / zrangebyscore
 *  - 令牌桶限流：tokenBucket(自研 MySQL 实现，替代 Lua eval)
 *  - 健康探针：ping
 *
 * 过期策略：惰性过期(读取时判断 expire_at)+ 写入时 upsert 覆盖。
 */
export class MysqlKvClient {
  private readonly logger = new Logger(MysqlKvClient.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 计算过期时间：ex=秒，px=毫秒 */
  private calcExpireAt(ex?: number, px?: number): Date | null {
    if (typeof px === 'number') return new Date(Date.now() + px);
    if (typeof ex === 'number') return new Date(Date.now() + ex * 1000);
    return null;
  }

  private isExpired(expireAt: Date | null | undefined): boolean {
    return !!expireAt && expireAt.getTime() <= Date.now();
  }

  // ---------------- 字符串 / KV ----------------

  /**GET key —— 过期返回 null */
  async get(key: string): Promise<string | null> {
    try {
      const row = await this.prisma.cacheKv.findUnique({ where: { cacheKey: key } });
      if (!row) return null;
      if (this.isExpired(row.expireAt)) {
        await this.prisma.cacheKv.delete({ where: { cacheKey: key } }).catch(() => undefined);
        return null;
      }
      return row.cacheVal;
    } catch (err) {
      this.logger.warn(`get(${key}) failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * SET key value [EX seconds | PX ms] [NX]
   * 兼容 ioredis 位置参数：set(key, val, 'EX', 60, 'NX')
   * 返回：成功 'OK'；NX 且已存在返回 null。
   */
  async set(key: string, value: string, ...args: (string | number)[]): Promise<'OK' | null> {
    let ex: number | undefined;
    let px: number | undefined;
    let nx = false;
    for (let i = 0; i < args.length; i++) {
      const flag = String(args[i]).toUpperCase();
      if (flag === 'EX') ex = Number(args[++i]);
      else if (flag === 'PX') px = Number(args[++i]);
      else if (flag === 'NX') nx = true;
      else if (flag === 'XX') {
        /* 忽略：本实现不常用 XX */
      }
    }
    const expireAt = this.calcExpireAt(ex, px);
    try {
      if (nx) {
        const existing = await this.prisma.cacheKv.findUnique({ where: { cacheKey: key } });
        if (existing && !this.isExpired(existing.expireAt)) return null;
        // 已过期或不存在：清理后写入
        if (existing) {
          await this.prisma.cacheKv.delete({ where: { cacheKey: key } }).catch(() => undefined);
        }
      }
      await this.prisma.cacheKv.upsert({
        where: { cacheKey: key },
        create: { cacheKey: key, cacheVal: value, expireAt },
        update: { cacheVal: value, expireAt },
      });
      return 'OK';
    } catch (err) {
      // 关键：写入异常(如表缺失/连接失败)必须抛出，
      // 不能返回 null —— 否则会被上层 NX 逻辑误判为“键已存在/限流命中”。
      this.logger.error(`set(${key}) failed: ${(err as Error).message}`);
      throw err;
    }
  }

  /** DEL key [key...] —— 返回删除数量 */
  async del(...keys: string[]): Promise<number> {
    const flat = keys.flat();
    if (flat.length === 0) return 0;
    try {
      const res = await this.prisma.cacheKv.deleteMany({ where: { cacheKey: { in: flat } } });
      return res.count;
    } catch (err) {
      this.logger.warn(`del failed: ${(err as Error).message}`);
      return 0;
    }
  }

  /** TTL key —— 返回剩余秒数；无过期 -1；不存在 -2 */
  async ttl(key: string): Promise<number> {
    try {
      const row = await this.prisma.cacheKv.findUnique({ where: { cacheKey: key } });
      if (!row) return -2;
      if (!row.expireAt) return -1;
      if (this.isExpired(row.expireAt)) {
        await this.prisma.cacheKv.delete({ where: { cacheKey: key } }).catch(() => undefined);
        return -2;
      }
      return Math.ceil((row.expireAt.getTime() - Date.now()) / 1000);
    } catch (err) {
      this.logger.warn(`ttl(${key}) failed: ${(err as Error).message}`);
      return -2;
    }
  }

  /** EXPIRE key seconds —— 返回 1 成功 / 0 键不存在 */
  async expire(key: string, seconds: number): Promise<number> {
    try {
      const row = await this.prisma.cacheKv.findUnique({ where: { cacheKey: key } });
      if (!row || this.isExpired(row.expireAt)) return 0;
      await this.prisma.cacheKv.update({
        where: { cacheKey: key },
        data: { expireAt: new Date(Date.now() + seconds * 1000) },
      });
      return 1;
    } catch (err) {
      this.logger.warn(`expire(${key}) failed: ${(err as Error).message}`);
      return 0;
    }
  }

  /** INCR key —— 原子自增 1，返回新值 */
  async incr(key: string): Promise<number> {
    return this.incrby(key, 1);
  }

  /** DECR key —— 原子自减 1，返回新值 */
  async decr(key: string): Promise<number> {
    return this.incrby(key, -1);
  }

  /** INCRBY key delta —— 通过事务保证原子性 */
  async incrby(key: string, delta: number): Promise<number> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.cacheKv.findUnique({ where: { cacheKey: key } });
        let base = 0;
        let expireAt: Date | null = null;
        if (row && !this.isExpired(row.expireAt)) {
          base = parseInt(row.cacheVal, 10) || 0;
          expireAt = row.expireAt;
        }
        const next = base + delta;
        await tx.cacheKv.upsert({
          where: { cacheKey: key },
          create: { cacheKey: key, cacheVal: String(next), expireAt },
          update: { cacheVal: String(next), expireAt },
        });
        return next;
      });
    } catch (err) {
      this.logger.warn(`incrby(${key}) failed: ${(err as Error).message}`);
      return 0;
    }
  }

  // ---------------- 有序集合 ZSET ----------------

  /** ZADD key score member —— 返回新增成员数 */
  async zadd(key: string, score: number | string, member: string): Promise<number> {
    try {
      const existing = await this.prisma.cacheZset.findUnique({
        where: { zkey_member: { zkey: key, member } },
      });
      await this.prisma.cacheZset.upsert({
        where: { zkey_member: { zkey: key, member } },
        create: { zkey: key, member, score: BigInt(score) },
        update: { score: BigInt(score) },
      });
      return existing ? 0 : 1;
    } catch (err) {
      this.logger.warn(`zadd(${key}) failed: ${(err as Error).message}`);
      return 0;
    }
  }

  /** ZREMRANGEBYSCORE key min max —— 返回删除成员数 */
  async zremrangebyscore(
    key: string,
    min: number | string,
    max: number | string,
  ): Promise<number> {
    try {
      const res = await this.prisma.cacheZset.deleteMany({
        where: { zkey: key, score: { gte: BigInt(min), lte: BigInt(max) } },
      });
      return res.count;
    } catch (err) {
      this.logger.warn(`zremrangebyscore(${key}) failed: ${(err as Error).message}`);
      return 0;
    }
  }

  /** ZRANGEBYSCORE key min max —— 返回按分值升序的 member 列表 */
  async zrangebyscore(
    key: string,
    min: number | string,
    max: number | string,
  ): Promise<string[]> {
    try {
      const rows = await this.prisma.cacheZset.findMany({
        where: { zkey: key, score: { gte: BigInt(min), lte: BigInt(max) } },
        orderBy: { score: 'asc' },
      });
      return rows.map((r) => r.member);
    } catch (err) {
      this.logger.warn(`zrangebyscore(${key}) failed: ${(err as Error).message}`);
      return [];
    }
  }

  // ---------------- 令牌桶限流（替代 Lua eval）----------------

  /**
   * 令牌桶限流：在 MySQL 中以 cache_kv 存储 "tokens:ts"，事务内原子补充+扣减。
   * @returns 允许返回 1，拒绝返回 0
   */
  async tokenBucket(
    key: string,
    capacity: number,
    refillPerSec: number,
    ttlSec: number,
  ): Promise<number> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const nowMs = Date.now();
        const row = await tx.cacheKv.findUnique({ where: { cacheKey: key } });
        let tokens = capacity;
        let lastMs = nowMs;
        if (row && !this.isExpired(row.expireAt)) {
          const [t, l] = row.cacheVal.split(':');
          tokens = Number(t);
          lastMs = Number(l);
          const refill = ((nowMs - lastMs) / 1000) * refillPerSec;
          tokens = Math.min(capacity, tokens + refill);
        }
        let allowed = 0;
        if (tokens >= 1) {
          tokens -= 1;
          allowed = 1;
        }
        const val = `${tokens}:${nowMs}`;
        const expireAt = new Date(nowMs + ttlSec * 1000);
        await tx.cacheKv.upsert({
          where: { cacheKey: key },
          create: { cacheKey: key, cacheVal: val, expireAt },
          update: { cacheVal: val, expireAt },
        });
        return allowed;
      });
    } catch (err) {
      this.logger.warn(`tokenBucket(${key}) failed: ${(err as Error).message}`);
      // 失败放行，避免限流基础设施故障阻断业务
      return 1;
    }
  }

  // ---------------- 健康 & 兼容占位 ----------------

  /** PING —— DB 可达返回 'PONG' */
  async ping(): Promise<string> {
    await this.prisma.$queryRaw`SELECT 1`;
    return 'PONG';
  }

  /** EVAL 兼容占位：不再支持 Lua，调用方应改用 tokenBucket。 */
  async eval(): Promise<never> {
    throw new Error('eval is not supported by MysqlKvClient; use tokenBucket() instead');
  }
}