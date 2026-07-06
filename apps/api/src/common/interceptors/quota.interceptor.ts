import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { RedisService } from '../../infra/redis/redis.service';

/**
 * 第 5 层 · Quota 配额拦截器（骨架）
 * 依据全局边界：每日 ≤ 3 份报告、AI ≤ 50 轮、AI 每日配额等。
 * 阶段 0：占位放行，真实按业务维度计数标记 blocked。
 */
@Injectable()
export class QuotaInterceptor implements NestInterceptor {
  constructor(private readonly redis: RedisService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // TODO(blocked): 依据路由元数据判定配额类型（报告日限/AI 轮次/AI 配额），
    // 基于 Redis 日计数器判断，超限抛对应 BizCode。当前阶段仅占位放行。
    void this.redis;
    void context;
    return next.handle();
  }
}