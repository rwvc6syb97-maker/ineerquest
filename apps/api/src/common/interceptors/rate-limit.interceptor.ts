import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { RedisService } from '../../infra/redis/redis.service';
import { BizCode } from '../response';
import type { CurrentUserPayload } from '../../modules/user/auth/current-user.decorator';

/** 全局边界：100 次 / 分 / 用户 */
const RATE_CAPACITY = 100;
const RATE_WINDOW_SEC = 60;
// 令牌桶补充速率（个/秒）
const RATE_REFILL_PER_SEC = RATE_CAPACITY / RATE_WINDOW_SEC;

/**
 * 令牌桶 Lua 脚本（原子）：
 * KEYS[1]=桶键  ARGV[1]=容量 ARGV[2]=速率/秒 ARGV[3]=当前ms ARGV[4]=本次取用
 * 返回 { allowed(1/0), remaining, retryAfterSec }
 */
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])
local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then tokens = capacity; ts = now end
local delta = math.max(0, now - ts) / 1000.0
tokens = math.min(capacity, tokens + delta * rate)
local allowed = 0
local retry = 0
if tokens >= requested then
  allowed = 1
  tokens = tokens - requested
else
  retry = math.ceil((requested - tokens) / rate)
end
redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', key, ${RATE_WINDOW_SEC})
return { allowed, math.floor(tokens), retry }
`;

/**
 * T1-22 · 第 4 层 Rate 限流拦截器（Redis Lua 令牌桶）。
 * - 100 次/分/用户；超限抛 HTTP 429 + Retry-After 头 + 业务码 90001。
 * - Redis 不可用时 try-catch 降级放行（标 blocked），不阻断请求。
 */
@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RateLimitInterceptor.name);

  constructor(private readonly redis: RedisService) {}

  private resolveKey(req: Request): string {
    const user = (req as Request & { user?: CurrentUserPayload }).user;
    if (user?.userId) return `rl:user:${user.userId}`;
    // 匿名请求按 IP 兜底
    const ip = req.ip || req.socket?.remoteAddress || 'anon';
    return `rl:ip:${ip}`;
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const key = this.resolveKey(req);

    try {
      const result = (await this.redis.raw.eval(
        TOKEN_BUCKET_LUA,
        1,
        key,
        RATE_CAPACITY,
        RATE_REFILL_PER_SEC,
        Date.now(),
        1,
      )) as [number, number, number];
      const [allowed, remaining, retryAfter] = result;

      res.setHeader('X-RateLimit-Limit', RATE_CAPACITY);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));

      if (allowed !== 1) {
        const retry = Math.max(1, retryAfter || RATE_WINDOW_SEC);
        res.setHeader('Retry-After', retry);
        throw new HttpException(
          { code: BizCode.RATE_LIMITED, message: '请求过于频繁，请稍后再试', data: null },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // TODO(blocked): 无真实 Redis 实例时降级放行，不阻断请求
      this.logger.warn(`rate-limit degraded(blocked): ${(err as Error).message}`);
    }

    return next.handle();
  }
}