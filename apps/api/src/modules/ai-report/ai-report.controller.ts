import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiResponse as ApiResp } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { AiReportService } from './ai-report.service';
import { PlainTalkDto, PlainTalkVo } from './ai-report.dto';

/**
 * L-P0-1 报告人话翻译（AI 增值层，只读报告不侵入本体）。
 * 路由：POST /api/v1/ai/report/plain-talk（全局前缀 /api/v1）。
 * 登录鉴权：AuthGuard 全局注入 req.user。
 */
@ApiTags('AI-报告人话翻译')
@ApiBearerAuth('user-token')
@Controller('ai/report')
export class AiReportController {
  constructor(private readonly aiReport: AiReportService) {}

  private requireUser(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new BizException(BizCode.TOKEN_INVALID, '未登录或登录已失效');
    }
    return user.userId;
  }

  /**
   * 报告人话翻译：把专业报告解读成普通人一看就懂的大白话。
   * 成功 code=200 data=PlainTalkVo；LLM 失败/超时走 degraded=true 兜底（仍 200，不白屏）。
   * 错误码：4203 报告不存在/无权访问；4302 章节未解锁；4511 sectionKey 非法。
   */
  @Post('plain-talk')
  @ApiOperation({ summary: '报告人话翻译', description: '只读报告文本经 LLM 翻译成大白话，失败自动降级兜底' })
  @ApiResp({ status: 200, description: '成功或降级兜底', type: PlainTalkVo })
  async plainTalk(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() dto: PlainTalkDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    const data = await this.aiReport.plainTalk(uid, dto);
    return ok(data, getTraceId(req));
  }
}