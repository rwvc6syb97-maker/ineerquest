import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { BizCode, BizException } from '../../common/response';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { AiChatService } from './ai-chat.service';
import { PersonalizedChatDto } from './ai-chat.dto';

/**
 * L-P0-2 深度个性化问答（SSE 流式）。
 * POST /api/v1/ai/chat/personalized —— 复用 ai-chat 配额/落库/流式全流程，
 * 在系统层注入用户最近一次 MBTI 人格上下文，使顾问据此个性化作答。
 * 无人格档案时降级为通用问答（不阻断）；轮次/配额/超长错误码对齐 v2.0。
 *
 * SSE 说明：手动 res 流式（绕过 ResponseInterceptor 的 JSON 包装），
 * 逐 token 推 data 事件；结束推 event:done；异常推 event:error（含 4502/4501/4504 等）。
 */
@ApiTags('AI对话')
@ApiBearerAuth('user-token')
@Controller('ai/chat')
export class AiChatPersonalizedController {
  constructor(private readonly aiChat: AiChatService) {}

  private requireUser(user?: CurrentUserPayload): string {
    if (!user?.userId) {
   throw new BizException(BizCode.TOKEN_INVALID, '未登录或登录已失效');
    }
    return user.userId;
  }

  /**
   * L-P0-2 深度个性化问答 POST /api/v1/ai/chat/personalized
   * 逐 token 推 `data:`；正常结束推 `event: done`；超长/轮次/配额超限推 `event: error`。
   */
  @Post('personalized')
  @ApiOperation({
    summary: '深度个性化问答（SSE 流式）',
    description:
      '注入用户最近一次 MBTI 人格上下文的流式问答。响应为 text/event-stream：' +
      'event:message 逐 token（含 delta/degraded），event:done 结束，event:error 携带业务错误码。',
  })
  @ApiResponse({ status: 200, description: 'SSE 流式响应（text/event-stream）' })
  async personalized(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() dto: PersonalizedChatDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const traceId = getTraceId(req);
    const uid = this.requireUser(user);

    // 内容超长显式二次校验（须在 SSE 头 flush 前，以标准 JSON 错误 4504 返回）
    if (dto.content.length > 2000) {
      throw new BizException(BizCode.AI_CONTENT_TOO_LONG, '消息内容超长，最多 2000 字');
    }

    // 建立 SSE 连接头
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    try {
      for await (const chunk of this.aiChat.personalizedStream(uid, dto.convNo, dto.content)) {
        if (chunk.done) {
          this.sse(res, 'done', { traceId });
          break;
        }
        if (chunk.delta) {
          this.sse(res, 'message', { delta: chunk.delta, degraded: chunk.degraded ?? false });
        }
      }
    } catch (err) {
      const bizCode = err instanceof BizException ? err.bizCode : 50000;
      const message = err instanceof Error ? err.message : 'AI 对话失败';
      this.sse(res, 'error', { code: bizCode, message, traceId });
    } finally {
      res.end();
    }
  }

  /** 写一条 SSE 事件。 */
  private sse(res: Response, event: string, data: unknown): void {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}