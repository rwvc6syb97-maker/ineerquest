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
 * T1-22 · 第 4 层 Rate 限流拦截器（MySQL 令牌桶）。
 * - 100 次/分/用户；超限抛 HTTP 429 + Retry-After 头 + 业务码 90001。
 * - 令牌桶已由 MySQL(cache_kv) 事务原子实现，替代原 Redis Lua 脚本。
 * - 基础设施异常时 try-catch 降级放行，不阻断请求。
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
      const allowed = await this.redis.tokenBucket(
        key,
        RATE_CAPACITY,
        RATE_REFILL_PER_SEC,
        RATE_WINDOW_SEC,
      );

      res.setHeader('X-RateLimit-Limit', RATE_CAPACITY);

      if (!allowed) {
        res.setHeader('Retry-After', RATE_WINDOW_SEC);
        throw new HttpException(
          { code: BizCode.RATE_LIMITED, message: '请求过于频繁，请稍后再试', data: null },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // 限流基础设施异常时降级放行，不阻断请求
      this.logger.warn(`rate-limit degraded: ${(err as Error).message}`);
    }

    return next.handle();
  }
}