import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { CoachingService } from './coaching.service';
import { BookCoachingDto, ListCoachesDto, ReviewCoachingDto } from './coaching.dto';

/**
 * CoachingController — 辅导咨询链路（§10.1，全部需登录）。
 *
 * 权威路由（§10.1）：
 * - GET  /api/v1/coaches                       规划师列表（筛选/分页）
 * - GET  /api/v1/coaches/:id                    规划师详情（不存在 → 4708）
 * - GET  /api/v1/coaches/:id/schedules          可预约时段
 * - POST /api/v1/coaching/orders                创建预约订单（锁时段）
 * - GET  /api/v1/coaching/orders                我的预约（分页）
 * - POST /api/v1/coaching/orders/:id/cancel     取消预约
 * - POST /api/v1/coaching/orders/:id/review     提交评价
 *
 * A5：修正 schedule→schedules（复数）、book→coaching/orders、新增 GET orders 与 cancel；
 *     §10.1 全部接口需登录，去除 @Public。
 */
@ApiTags('辅导')
@ApiBearerAuth('user-token')
@Controller()
export class CoachingController {
  constructor(private readonly coaching: CoachingService) {}

  private requireUser(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new BizException(BizCode.TOKEN_INVALID, '未登录或登录已失效');
    }
    return user.userId;
  }

  /** 规划师列表 GET /api/v1/coaches */
  @Get('coaches')
  async list(@Query() query: ListCoachesDto, @Req() req: Request) {
    return ok(await this.coaching.listCoaches(query), getTraceId(req), 'ok');
  }

  /** 规划师详情 GET /api/v1/coaches/:id（不存在 → 4708） */
  @Get('coaches/:id')
  async detail(@Param('id') id: string, @Req() req: Request) {
    return ok(await this.coaching.getCoach(id), getTraceId(req), 'ok');
  }

  /** 可预约时段 GET /api/v1/coaches/:id/schedules（A5：复数 schedules） */
  @Get('coaches/:id/schedules')
  async schedules(@Param('id') id: string, @Req() req: Request) {
    return ok(await this.coaching.getSchedule(id), getTraceId(req), 'ok');
  }

  /** 创建预约订单 POST /api/v1/coaching/orders（A5：独立 coaching/orders 前缀） */
  @Post('coaching/orders')
  async createOrder(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() dto: BookCoachingDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.coaching.bookCoaching(uid, dto), getTraceId(req), '预约已创建，请尽快支付');
  }

  /** 我的预约 GET /api/v1/coaching/orders（A5 新增） */
  @Get('coaching/orders')
  async listOrders(@CurrentUser() user: CurrentUserPayload | undefined, @Req() req: Request) {
    const uid = this.requireUser(user);
    return ok(await this.coaching.listOrders(uid), getTraceId(req), 'ok');
  }

  /** 取消预约 POST /api/v1/coaching/orders/:id/cancel（A5 新增） */
  @Post('coaching/orders/:id/cancel')
  async cancelOrder(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') orderId: string,
    @Body('reason') reason: string | undefined,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.coaching.cancelOrder(uid, orderId, reason), getTraceId(req), '预约已取消');
  }

  /** 提交评价 POST /api/v1/coaching/orders/:id/review */
  @Post('coaching/orders/:id/review')
  async review(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') orderId: string,
    @Body() dto: ReviewCoachingDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.coaching.reviewOrder(uid, orderId, dto), getTraceId(req), '评价已提交');
  }
}