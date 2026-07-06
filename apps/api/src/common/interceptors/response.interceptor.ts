import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Request } from 'express';
import { ApiResponse, ok } from '../response';
import { getTraceId } from '../middleware/trace.middleware';

/**
 * 第 7 层 · Response 统一响应拦截器
 * 将 controller 返回值统一包装为 { code, message, data, traceId }。
 * 若返回值已是标准结构（含 code 与 traceId），则原样透传。
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<unknown>> {
    const req = context.switchToHttp().getRequest<Request>();
    const traceId = getTraceId(req);
    return next.handle().pipe(
      map((data: unknown) => {
        if (
          data &&
          typeof data === 'object' &&
          'code' in (data as Record<string, unknown>) &&
          'traceId' in (data as Record<string, unknown>)
        ) {
          return data as ApiResponse<unknown>;
        }
        return ok(data, traceId);
      }),
    );
  }
}