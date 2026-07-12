import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse as ApiResp, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { AiCoachingService } from './ai-coaching.service';
import {
  PreBriefDto,
  PreBriefVo,
  SummaryDto,
  SummaryVo,
  MatchDto,
  MatchVo,
} from './ai-coaching.dto';

/**
 * §2.2~2.4 AI 辅导相关接口。
 * 路由前缀：/api/v1/ai/coaching。
 */
@ApiTags('AI-辅导咨询')
@ApiBearerAuth('user-token')
@Controller('ai/coaching')
export class AiCoachingController {
  constructor(private readonly service: AiCoachingService) {}

  private requireUser(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new BizException(BizCode.AI_UNAUTHORIZED, '未登录或登录已失效');
    }
    return user.userId;
  }

  /** §2.2 咨询前问题梳理师。错误码：4001/4003/4004/4005/4710/5002/5003。 */
  @Post('pre-brief')
  @ApiOperation({ summary: 'AI 咨询前问题梳理', description: '根据问答生成结构化提纲，一订单一提纲（幂等）' })
  @ApiResp({ status: 200, type: PreBriefVo })
  async preBrief(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() dto: PreBriefDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.service.preBrief(uid, dto), getTraceId(req));
  }

  /** §2.3 咨询后行动纪要。错误码：4001/4003/4004/4711/4712/5002/5003。 */
  @Post('summary')
  @ApiOperation({ summary: 'AI 咨询后行动纪要', description: '从会话消息流生成纪要+待办，一订单一纪要（幂等）' })
  @ApiResp({ status: 200, type: SummaryVo })
  async summary(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() dto: SummaryDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.service.summary(uid, dto), getTraceId(req));
  }

  /** §2.4 辅导师智能匹配。错误码：4001/4005/4713/5002/5003（降级）。 */
  @Post('match')
  @ApiOperation({ summary: 'AI 辅导师智能匹配', description: '按诉求画像相似度+LLM理由推荐辅导师' })
  @ApiResp({ status: 200, type: MatchVo })
  async match(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() dto: MatchDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.service.match(uid, dto), getTraceId(req));
  }
}