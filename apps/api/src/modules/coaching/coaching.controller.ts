import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { Public } from '../../common/guards/auth.guard';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { CoachingService } from './coaching.service';
import { BookCoachingDto, ListCoachesDto, ReviewCoachingDto } from './coaching.dto';

/**
 * CoachingController — 辅导咨询链路（T4-01 / T4-02 / T4-04）。
 *
 * 公开（@Public，游客可浏览）：
 * - GET  /api/v1/coaches               辅导师列表（分页/筛选，仅审核通过且上架）
 * - GET  /api/v1/coaches/:id           辅导师详情
 * - GET  /api/v1/coaches/:id/schedule  可约时段
 *
 * 需登录：
 * - POST /api/v1/coaches/book          辅导预约下单（时段锁 + uk_coach_slot 防重叠）
 * - POST /api/v1/coaches/orders/:id/review  咨询评价（仅已完成订单）
 */
@ApiTags('辅导')
@ApiBearerAuth('user-token')
@Controller('coaches')
export class CoachingController {
  constructor(private readonly coaching: CoachingService) {}

  private requireUser(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new BizException(BizCode.TOKEN_INVALID, '未登录或登录已失效');
    }
    return user.userId;
  }

  /** T4-01 辅导师列表 GET /api/v1/coaches */
  @Public()
  @Get()
  async list(@Query() query: ListCoachesDto, @Req() req: Request) {
    return ok(await this.coaching.listCoaches(query), getTraceId(req), 'ok');
  }

  /** T4-01 辅导师详情 GET /api/v1/coaches/:id */
  @Public()
  @Get(':id')
  async detail(@Param('id') id: string, @Req() req: Request) {
    return ok(await this.coaching.getCoach(id), getTraceId(req), 'ok');
  }

  /** T4-01 可约时段 GET /api/v1/coaches/:id/schedule */
  @Public()
  @Get(':id/schedule')
  async schedule(@Param('id') id: string, @Req() req: Request) {
    return ok(await this.coaching.getSchedule(id), getTraceId(req), 'ok');
  }

  /** T4-02 辅导预约下单 POST /api/v1/coaches/book（需登录） */
  @Post('book')
  async book(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() dto: BookCoachingDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.coaching.bookCoaching(uid, dto), getTraceId(req), '预约已创建，请尽快支付');
  }

  /** T4-04 咨询评价 POST /api/v1/coaches/orders/:id/review（需登录） */
  @Post('orders/:id/review')
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