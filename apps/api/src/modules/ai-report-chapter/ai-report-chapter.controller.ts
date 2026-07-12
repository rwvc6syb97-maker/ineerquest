import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiResponse as ApiResp } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { AiReportChapterService } from './ai-report-chapter.service';
import { ReportChapterDto, ReportChapterVo } from './ai-report-chapter.dto';

/**
 * §3.3 深度报告 AI 扩展章节。
 * 路由：POST /api/v1/ai/report/chapter（全局前缀 /api/v1）。
 * 权限：已登录；仅 DEEP 报告可扩展（4517）；仅报告归属人（4003）。
 * 护城河：仅写 report_ai_chapter，绝不写报告本体表。
 */
@ApiTags('AI-深度报告扩展章节')
@ApiBearerAuth('user-token')
@Controller('ai/report')
export class AiReportChapterController {
  constructor(private readonly service: AiReportChapterService) {}

  private requireUser(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new BizException(BizCode.AI_UNAUTHORIZED, '未登录或登录已失效');
    }
    return user.userId;
  }

  /**
   * 生成深度报告扩展章节。
   * 成功 code=200 data=ReportChapterVo；LLM 失败/超时走 degraded=true 回退规则版（仍 200）。
   * 错误码：4004 报告不存在；4003 越权；4517 非深度报告；4000 入参校验失败；5002/5003 上游异常（降级）。
   */
  @Post('chapter')
  @ApiOperation({ summary: 'AI 深度报告扩展章节', description: 'LLM 生成扩展章节，失败自动降级规则版' })
  @ApiResp({ status: 200, description: '成功或降级兜底', type: ReportChapterVo })
  async chapter(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() dto: ReportChapterDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    const data = await this.service.generate(uid, dto);
    return ok(data, getTraceId(req));
  }
}