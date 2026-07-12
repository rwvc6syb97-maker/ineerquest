import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiResponse as ApiResp } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { InterviewBankService } from './interview-bank.service';
import {
  QuestionListQueryDto,
  QuestionListVo,
  QuestionScoreDto,
  QuestionScoreVo,
} from './interview-bank.dto';

/**
 * §4.2 AI 面试题库 + 模拟评分。
 * 路由：GET /api/v1/ai/interview/questions（登录可见）、
 *       POST /api/v1/ai/interview/questions/:qId/score（会员专享）。
 * 静态段 questions 与 §4.1 的 :id 动态段不冲突（NestJS 静态优先）。
 */
@ApiTags('AI-面试题库')
@ApiBearerAuth('user-token')
@Controller('ai/interview/questions')
export class InterviewBankController {
  constructor(private readonly service: InterviewBankService) {}

  private requireUser(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new BizException(BizCode.AI_UNAUTHORIZED, '未登录或登录已失效');
    }
    return user.userId;
  }

  /** 题库列表（登录可见）。错误码：4001 未登录；4000 入参。 */
  @Get()
  @ApiOperation({ summary: 'AI 面试题库列表', description: '按职业/难度分页，仅返回已发布题' })
  @ApiResp({ status: 200, type: QuestionListVo })
  async list(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Query() query: QuestionListQueryDto,
    @Req() req: Request,
  ) {
    this.requireUser(user);
    const data = await this.service.list(query);
    return ok(data, getTraceId(req));
  }

  /** 单题评分（会员专享）。错误码：4515 非会员；4004 题不存在；4005 answer 空。 */
  @Post(':qId/score')
  @ApiOperation({ summary: 'AI 单题评分', description: '会员专享，LLM 失败降级规则版' })
  @ApiResp({ status: 200, type: QuestionScoreVo })
  async score(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('qId') qId: string,
    @Body() dto: QuestionScoreDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    const data = await this.service.score(uid, qId, dto);
    return ok(data, getTraceId(req));
  }
}