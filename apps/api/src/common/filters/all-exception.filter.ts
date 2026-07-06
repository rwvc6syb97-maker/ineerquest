import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { BizException, CommonCode, fail } from '../response';
import { getTraceId } from '../middleware/trace.middleware';

/**
 * 第 8 层 · 全局异常过滤器
 * 将所有异常统一转为 { code, message, data:null, traceId }，HTTP 状态保留语义。
 */
@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const traceId = getTraceId(req);

    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: number = CommonCode.INTERNAL_ERROR;
    let message = 'Internal server error';

    if (exception instanceof BizException) {
      // 业务异常：直�输出业务码，HTTP 状态默认 200（前端以 code 判定）
      httpStatus = exception.httpStatus;
      code = exception.bizCode;
      message = exception.message;
      this.logger.warn(`[${traceId}] biz ${code} ${message}`);
      res.status(httpStatus).json(fail(code, message, traceId));
      return;
    }

    if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      const resp = exception.getResponse();
      message =
        typeof resp === 'string'
          ? resp
          : ((resp as { message?: string | string[] }).message as string) || exception.message;
      if (Array.isArray(message)) {
        message = message.join('; ');
      }
      code = this.mapHttpToBiz(httpStatus);
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    this.logger.error(`[${traceId}] ${httpStatus} ${message}`);
    res.status(httpStatus).json(fail(code, message, traceId));
  }

  private mapHttpToBiz(status: number): number {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return CommonCode.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return CommonCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return CommonCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return CommonCode.NOT_FOUND;
      default:
        return CommonCode.INTERNAL_ERROR;
    }
  }
}