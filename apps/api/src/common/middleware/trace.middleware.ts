import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * 第 1 层 · Trace 中间件
 * 为每个请求注入/透传 traceId，贯穿日志、响应体与错误。
 */
@Injectable()
export class TraceMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = (req.headers['x-trace-id'] as string) || '';
    const traceId = incoming || randomUUID();
    // 挂到 req 供后续拦截器/过滤器读取
    (req as Request & { traceId: string }).traceId = traceId;
    res.setHeader('x-trace-id', traceId);
    next();
  }
}

/** 从请求中读取 traceId 的辅助函数 */
export function getTraceId(req: unknown): string {
  const r = req as { traceId?: string } | undefined;
  return r?.traceId ?? 'unknown';
}