import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiResponse as ApiResp } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { AiCareerPlanService } from './ai-career-plan.service';
import { GrowthPlanDto, GrowthPlanVo } from './ai-career-plan.dto';

/**
 * §2.1 AI 动态成长计划。
 * 路由：POST /api/v1/ai/career/growth-plan（全局前缀 /api/v1）。
 * 权限：已登录 + 会员/付费校验（非会员 4515）。
 */
@ApiTags('AI-动态成长计划')
@ApiBearerAuth('user-token')
@Controller('ai/career')
export class AiCareerPlanController {
  constructor(private readonly service: AiCareerPlanService) {}

  private requireUser(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new BizException(BizCode.AI_UNAUTHORIZED, '未登录或登录已失效');
    }
    return user.userId;
  }

  /**
   * 生成动态成长计划。
   * 成功 code=200 data=GrowthPlanVo；LLM 失败/超时走 degraded=true 回退规则版（仍 200）。
   * 错误码：4515 非会员；4005 targetMonths 越界；4004 职业不存在；5002/5003 上游异常（降级）。
   */
  @Post('growth-plan')
  @ApiOperation({ summary: 'AI 动态成长计划', description: 'LLM 生成分周成长计划，失败自动降级规则版' })
  @ApiResp({ status: 200, description: '成功或降级兜底', type: GrowthPlanVo })
  async growthPlan(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() dto: GrowthPlanDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    const data = await this.service.generate(uid, dto);
    return ok(data, getTraceId(req));
  }
}