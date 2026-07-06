import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok } from '../../common/response';
import { RequirePerms } from '../../common/guards/permission.guard';
import { AdminAnalyticsService } from './admin-analytics.service';

/**
 * T4-12 数据看板接口 `/api/v1/admin/analytics/*`（权限 analytics:read）。
 * 全部为只读 GET，数据源 ClickHouse 优先、MySQL 降级、mock 兜底（见 service）。
 */
@ApiTags('后台-数据分析')
@ApiBearerAuth('admin-token')
@Controller('admin/analytics')
@RequirePerms('analytics:read')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  private parseDays(days?: string): number {
    const n = Number(days);
    return Number.isFinite(n) && n > 0 ? Math.min(365, Math.floor(n)) : 30;
  }

  @Get('overview')
  async overview(@Req() req: Request) {
    return ok(await this.analytics.overview(), getTraceId(req), 'ok');
  }

  @Get('growth')
  async growth(@Query('days') days: string, @Req() req: Request) {
    return ok(await this.analytics.growth(this.parseDays(days)), getTraceId(req), 'ok');
  }

  @Get('funnel')
  async funnel(@Query('days') days: string, @Req() req: Request) {
    return ok(await this.analytics.funnel(this.parseDays(days)), getTraceId(req), 'ok');
  }

  @Get('revenue')
  async revenue(@Query('days') days: string, @Req() req: Request) {
    return ok(await this.analytics.revenue(this.parseDays(days)), getTraceId(req), 'ok');
  }

  @Get('assessment-rate')
  async assessmentRate(@Query('days') days: string, @Req() req: Request) {
    return ok(await this.analytics.assessmentRate(this.parseDays(days)), getTraceId(req), 'ok');
  }
}