import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MockRedisService {
  private readonly logger = new Logger(MockRedisService.name);
  private readonly store = new Map<string, string>();
  private readonly ttlStore = new Map<string, number>();

  get raw(): never {
    throw new Error('MockRedisService does not provide raw Redis client');
  }

  async ping(): Promise<boolean> {
    return false;
  }

  async get(key: string): Promise<string | null> {
    this.logger.debug(`MockRedis GET ${key}`);
    if (this.isExpired(key)) {
      this.store.delete(key);
      this.ttlStore.delete(key);
      return null;
    }
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string, options?: { EX?: number }): Promise<string | 'OK'> {
    this.logger.debug(`MockRedis SET ${key} (EX=${options?.EX})`);
    this.store.set(key, value);
    if (options?.EX) {
      this.ttlStore.set(key, Date.now() + options.EX * 1000);
    } else {
      this.ttlStore.delete(key);
    }
    return 'OK';
  }

  async del(key: string): Promise<number> {
    this.logger.debug(`MockRedis DEL ${key}`);
    const existed = this.store.has(key);
    this.store.delete(key);
    this.ttlStore.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    if (this.isExpired(key)) {
      return 0;
    }
    return this.store.has(key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    this.logger.debug(`MockRedis INCR ${key}`);
    const current = parseInt(this.store.get(key) ?? '0', 10);
    const next = current + 1;
    this.store.set(key, next.toString());
    return next;
  }

  async decr(key: string): Promise<number> {
    this.logger.debug(`MockRedis DECR ${key}`);
    const current = parseInt(this.store.get(key) ?? '0', 10);
    const next = Math.max(0, current - 1);
    this.store.set(key, next.toString());
    return next;
  }

  async incrby(key: string, value: number): Promise<number> {
    this.logger.debug(`MockRedis INCRBY ${key} ${value}`);
    const current = parseInt(this.store.get(key) ?? '0', 10);
    const next = current + value;
    this.store.set(key, next.toString());
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.logger.debug(`MockRedis EXPIRE ${key} ${seconds}`);
    if (this.store.has(key)) {
      this.ttlStore.set(key, Date.now() + seconds * 1000);
      return 1;
    }
    return 0;
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    this.logger.debug(`MockRedis HSET ${key} ${field}`);
    const hashKey = `${key}:${field}`;
    const existed = this.store.has(hashKey);
    this.store.set(hashKey, value);
    return existed ? 0 : 1;
  }

  async hget(key: string, field: string): Promise<string | null> {
    this.logger.debug(`MockRedis HGET ${key} ${field}`);
    return this.store.get(`${key}:${field}`) ?? null;
  }

  async hdel(key: string, field: string): Promise<number> {
    this.logger.debug(`MockRedis HDEL ${key} ${field}`);
    const hashKey = `${key}:${field}`;
    const existed = this.store.has(hashKey);
    this.store.delete(hashKey);
    return existed ? 1 : 0;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    this.logger.debug(`MockRedis HGETALL ${key}`);
    const result: Record<string, string> = {};
    for (const [k, v] of this.store.entries()) {
      if (k.startsWith(`${key}:`)) {
        result[k.slice(key.length + 1)] = v;
      }
    }
    return result;
  }

  async sadd(key: string, member: string): Promise<number> {
    this.logger.debug(`MockRedis SADD ${key} ${member}`);
    const setKey = `${key}:set`;
    const current = this.store.get(setKey) ?? '';
    const members = current ? current.split(',') : [];
    if (!members.includes(member)) {
      members.push(member);
      this.store.set(setKey, members.join(','));
      return 1;
    }
    return 0;
  }

  async smembers(key: string): Promise<string[]> {
    this.logger.debug(`MockRedis SMEMBERS ${key}`);
    const setKey = `${key}:set`;
    const current = this.store.get(setKey) ?? '';
    return current ? current.split(',') : [];
  }

  async srem(key: string, member: string): Promise<number> {
    this.logger.debug(`MockRedis SREM ${key} ${member}`);
    const setKey = `${key}:set`;
    const current = this.store.get(setKey) ?? '';
    const members = current ? current.split(',') : [];
    const initialLength = members.length;
    const filtered = members.filter((m) => m !== member);
    this.store.set(setKey, filtered.join(','));
    return initialLength - filtered.length;
  }

  async ttl(key: string): Promise<number> {
    const expireAt = this.ttlStore.get(key);
    if (!expireAt) return -1;
    const remaining = Math.ceil((expireAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async flushall(): Promise<string> {
    this.logger.debug(`MockRedis FLUSHALL`);
    this.store.clear();
    this.ttlStore.clear();
    return 'OK';
  }

  async keys(pattern: string): Promise<string[]> {
    this.logger.debug(`MockRedis KEYS ${pattern}`);
    const keys: string[] = [];
    for (const key of this.store.keys()) {
      if (this.matchesPattern(key, pattern)) {
        keys.push(key);
      }
    }
    return keys;
  }

  private isExpired(key: string): boolean {
    const expireAt = this.ttlStore.get(key);
    if (!expireAt) return false;
    return Date.now() > expireAt;
  }

  private matchesPattern(key: string, pattern: string): boolean {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(key);
  }
}
