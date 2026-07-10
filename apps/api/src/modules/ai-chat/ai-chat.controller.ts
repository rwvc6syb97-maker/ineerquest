import { Body, Controller, Delete, Get, Param, Post, Req, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { AiChatService } from './ai-chat.service';
import { CreateConversationDto, SendMessageDto } from './ai-chat.dto';

/**
 * AiChatController — AI 深度对话（T3-04 会话 CRUD / T3-05 发送消息 SSE 流式）。
 * /conversations 前缀；均需登录（AuthGuard 注入 req.user）。
 *
 * T3-05 说明：SSE 端点用手动 res 流式（绕过 ResponseInterceptor 的 JSON 包装），
 * 逐 token 推送 data 事件，结束推送 event:done；轮次/配额超限以 event:error 推送错误码 50001/50002。
 */
@ApiTags('AI对话')
@ApiBearerAuth('user-token')
@Controller('conversations')
export class AiChatController {
  constructor(private readonly aiChat: AiChatService) {}

  private requireUser(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new BizException(BizCode.TOKEN_INVALID, '未登录或登录已失效');
    }
    return user.userId;
  }

  /** T3-04 创建会话 POST /api/v1/conversations */
  @Post()
  async create(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() dto: CreateConversationDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.aiChat.createConversation(uid, dto), getTraceId(req), '会话已创建');
  }

  /** T3-04 会话列表 GET /api/v1/conversations */
  @Get()
  async list(@CurrentUser() user: CurrentUserPayload | undefined, @Req() req: Request) {
    const uid = this.requireUser(user);
    return ok(await this.aiChat.listConversations(uid), getTraceId(req));
  }

  /** T3-04 会话消息列表 GET /api/v1/conversations/:id/messages */
  @Get(':id/messages')
  async messages(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') convNo: string,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.aiChat.listMessages(uid, convNo), getTraceId(req));
  }

  /** T3-04 删除会话 DELETE /api/v1/conversations/:id */
  @Delete(':id')
  async remove(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') convNo: string,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.aiChat.deleteConversation(uid, convNo), getTraceId(req), '会话已删除');
  }

  /**
   * T3-05 发送消息（SSE 流式）POST /api/v1/conversations/:id/messages
   * 逐 token 推 `data:`；正常结束推 `event: done`；轮次/配额超限推 `event: error`（含 50001/50002）。
   */
  @Post(':id/messages')
  async sendMessage(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') convNo: string,
    @Body() dto: SendMessageDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const traceId = getTraceId(req);
    const uid = this.requireUser(user);

    // 内容超长显式二次校验（须在 SSE 头 flush 前，以标准 JSON 错误 4504 返回，避免降级为通用 400）
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
      for await (const chunk of this.aiChat.streamMessage(uid, convNo, dto.content)) {
        if (chunk.done) {
          // 结束事件
          this.sse(res, 'done', { traceId });
          break;
        }
        if (chunk.delta) {
          this.sse(res, 'message', { delta: chunk.delta, degraded: chunk.degraded ?? false });
        }
      }
    } catch (err) {
      // 轮次/配额超限（50002/50001）或其它异常 → error 事件
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