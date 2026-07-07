import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request } from 'express';
import { getTraceId } from '../middleware/trace.middleware';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AUDIT_KEY, AuditMeta, getAuditBefore } from './audit.decorator';

/** 后台审计事件类型（写入 event_log.event_type） */
export const ADMIN_OP_EVENT = 'admin_op';

/** 需审计的写操作方法 */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type AdminReq = Request & {
  user?: { userId: string; jti: string; scope?: 'app' | 'admin'; role?: number; perms?: string[] };
};

/**
 * 第 9 层 · Audit 审计拦截器（T4-11）。
 *
 * 落地点：
 *  1. 始终记录请求方法/路径/耗时/traceId 到日志（沿用阶段0 行为）。
 *  2. 对「后台写操作」（scope=admin 且方法为 POST/PUT/PATCH/DELETE）
 *     将操作人、IP、前值(before)/后值(after) 快照写入 event_log（event_type=admin_op）。
 *  3. 读操作（GET/HEAD/OPTIONS）跳过入库。
 *  4. before 由业务在 handler 内经 setAuditBefore(req, old) 提供；after 取响应 data 兜底请求体。
 *  5. 入库全程 try-catch，绝不阻断主流程（对齐 analytics 降级策略）。
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AdminReq>();
    const traceId = getTraceId(req);
    const started = Date.now();
    const { method, originalUrl } = req;
    const before = getAuditBefore(req);

    return next.handle().pipe(
      tap((responseData) => {
        const cost = Date.now() - started;
        this.logger.log(`[${traceId}] ${method} ${originalUrl} ${cost}ms`);

        if (this.shouldAudit(req)) {
          const meta = this.reflector.getAllAndOverride<AuditMeta | undefined>(AUDIT_KEY, [
            context.getHandler(),
            context.getClass(),
          ]);
          // fire-and-forget：异常仅告警
          void this.writeAuditLog(req, meta, before, responseData, traceId).catch((err) => {
            this.logger.warn(`admin_op audit skipped: ${(err as Error).message}`);
          });
        }
      }),
    );
  }

  /** 仅对 scope=admin 的写操作审计 */
  private shouldAudit(req: AdminReq): boolean {
    return WRITE_METHODS.has((req.method || '').toUpperCase()) && req.user?.scope === 'admin';
  }

  private clientIp(req: Request): string {
    const xff = (req.headers['x-forwarded-for'] as string) || '';
    return xff.split(',')[0].trim() || req.ip || req.socket?.remoteAddress || 'unknown';
  }

  private async writeAuditLog(
    req: AdminReq,
    meta: AuditMeta | undefined,
    before: unknown,
    after: unknown,
    traceId: string,
  ): Promise<void> {
    const operatorId = req.user?.userId;
    const properties = {
      resource: meta?.resource ?? req.originalUrl,
      action: meta?.action ?? req.method,
      operatorId: operatorId ?? null,
      role: req.user?.role ?? null,
      ip: this.clientIp(req),
      method: req.method,
      path: req.originalUrl,
      before: before ?? null,
      // after 优先取响应 data（已含变更后视图），回退为请求体
      after: (after as { data?: unknown })?.data ?? req.body ?? null,
      traceId,
    };
    // event_log.ip 为 VarBinary(16)：IP 已存入 properties.ip，此处列留空避免编码转换（降级项）
    await this.prisma.eventLog.create({
      data: {
        userId: operatorId ? BigInt(operatorId) : null,
        eventType: ADMIN_OP_EVENT,
        page: req.originalUrl?.slice(0, 128),
        properties: properties as any,
        ua: (req.headers['user-agent'] as string)?.slice(0, 512) ?? null,
        eventTime: new Date(),
      },
    });
  }
}