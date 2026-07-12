import { Body, Controller, Get, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiResponse as ApiResp } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { DailyBriefService } from './daily-brief.service';
import {
  DailyBriefQueryDto,
  DailyBriefVo,
  SubscriptionUpdateDto,
  SubscriptionVo,
} from './daily-brief.dto';

/**
 * §4.3 AI 职业热点日报（登录可见）。
 * 路由：GET /api/v1/ai/daily-brief、PUT /api/v1/ai/daily-brief/subscription（全局前缀 /api/v1）。
 */
@ApiTags('AI-职业热点日报')
@ApiBearerAuth('user-token')
@Controller('ai/daily-brief')
export class DailyBriefController {
  constructor(private readonly service: DailyBriefService) {}

  private requireUser(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new BizException(BizCode.AI_UNAUTHORIZED, '未登录或登录已失效');
    }
    return user.userId;
  }

  /** 获取我的日报。错误码：4001 未登录；4004 当日无日报；4000 date 格式错。 */
  @Get()
  @ApiOperation({ summary: '获取我的职业热点日报', description: 'scheduler 生成，接口仅读已发布日报' })
  @ApiResp({ status: 200, type: DailyBriefVo })
  async getMine(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Query() query: DailyBriefQueryDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    const data = await this.service.getMine(uid, query);
    return ok(data, getTraceId(req));
  }

  /** 订阅设置（幂等）。错误码：4001 未登录；4000 入参。 */
  @Put('subscription')
  @ApiOperation({ summary: '日报订阅设置', description: '开关 + 订阅品类，一人一条' })
  @ApiResp({ status: 200, type: SubscriptionVo })
  async updateSubscription(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() dto: SubscriptionUpdateDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    const data = await this.service.updateSubscription(uid, dto);
    return ok(data, getTraceId(req));
  }
}