import { Body, Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { CareerPlanService } from './career-plan.service';

/** 学习资源查询 */
export class LearningResourceQueryDto {
  @IsOptional()
  @IsString()
  skill?: string;

  @IsOptional()
  @IsString()
  careerId?: string;

  @IsOptional()
  @IsString()
  type?: string;
}

/** 任务打卡请求体 */
export class ToggleTaskDto {
  @IsBoolean()
  isDone!: boolean;
}

/**
 * CareerPlanController — 职业规划扩展接口。
 *   GET   /api/v1/skills-gap/:careerId              技能差距分析（P16）
 *   GET   /api/v1/learning/resources                学习资源推荐（P17）
 *   GET   /api/v1/growth/plan                        成长计划（P18）
 *   PATCH /api/v1/growth/plan/:planId/tasks/:taskId  任务打卡
 * 与前端契约 apps/web/src/api/modules/career-plan.api.ts 严格对齐。
 */
@ApiTags('职业规划')
@Controller()
export class CareerPlanController {
  constructor(private readonly plan: CareerPlanService) {}

  private requireUser(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new BizException(BizCode.TOKEN_INVALID, '未登录或登录已失效');
    }
    return user.userId;
  }

  /** P16 技能差距分析 */
  @Get('skills-gap/:careerId')
  async skillGap(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('careerId') careerId: string,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.plan.skillGap(uid, careerId), getTraceId(req));
  }

  /** P17 学习资源推荐（可选 skill / careerId / type 过滤） */
  @Get('learning/resources')
  async learningResources(@Query() query: LearningResourceQueryDto, @Req() req: Request) {
    return ok(await this.plan.learningResources(query), getTraceId(req));
  }

  /** P18 成长计划列表（当前登录用户） */
  @Get('growth/plan')
  async growthPlans(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.plan.growthPlans(uid), getTraceId(req));
  }

  /** 任务打卡（切换完成状态，重算进度） */
  @Patch('growth/plan/:planId/tasks/:taskId')
  async toggleTask(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('planId') planId: string,
    @Param('taskId') taskId: string,
    @Body() body: ToggleTaskDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.plan.toggleTask(uid, planId, taskId, body.isDone), getTraceId(req));
  }
}