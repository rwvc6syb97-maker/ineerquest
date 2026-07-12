import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiResponse as ApiResp } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { AiInterviewService } from './ai-interview.service';
import {
  InterviewAnswerDto,
  InterviewAnswerVo,
  InterviewReportVo,
  InterviewStartDto,
  InterviewStartVo,
} from './ai-interview.dto';

/**
 * §4.1 AI 模拟面试（会员专享）。
 * 路由：POST /api/v1/ai/interview/start、POST /api/v1/ai/interview/:id/answer、
 *       GET /api/v1/ai/interview/:id/report（全局前缀 /api/v1）。
 * 权限：已登录（4001）+ 会员/付费校验（非会员 4515，service 内校验）。
 */
@ApiTags('AI-模拟面试')
@ApiBearerAuth('user-token')
@Controller('ai/interview')
export class AiInterviewController {
  constructor(private readonly service: AiInterviewService) {}

  private requireUser(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new BizException(BizCode.AI_UNAUTHORIZED, '未登录或登录已失效');
    }
    return user.userId;
  }

  /** 开始面试：返回 interviewId 与首题。错误码：4515 非会员；4004业不存在；4000 入参。 */
  @Post('start')
  @ApiOperation({ summary: '开始 AI 模拟面试', description: '会员专享，返回首题' })
  @ApiResp({ status: 200, type: InterviewStartVo })
  async start(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() dto: InterviewStartDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    const data = await this.service.start(uid, dto);
    return ok(data, getTraceId(req));
  }

  /** 提交作答：返回评分/反馈/下一题/是否结束。错误码：4520 已结束；4003 越权；4004 会话不存在；4005 answer 空。 */
  @Post(':id/answer')
  @ApiOperation({ summary: '提交面试作答', description: '评分并返回下一题；末轮结束并汇总' })
  @ApiResp({ status: 200, type: InterviewAnswerVo })
  async answer(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') id: string,
    @Body() dto: InterviewAnswerDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    const data = await this.service.answer(uid, id, dto);
    return ok(data, getTraceId(req));
  }

  /** 面试报告：总分/维度/建议。错误码：4003 越权；4004 会话不存在。 */
  @Get(':id/report')
  @ApiOperation({ summary: '获取面试报告', description: '总分、维度评分与改进建议' })
  @ApiResp({ status: 200, type: InterviewReportVo })
  async report(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    const data = await this.service.report(uid, id);
    return ok(data, getTraceId(req));
  }
}