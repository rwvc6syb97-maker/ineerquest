import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizException, BizCode } from '../../common/response';
import { RequirePerms } from '../../common/guards/permission.guard';
import { AdminAnalyticsService, MODULE_USAGE_KEYS } from './admin-analytics.service';

/**
 * T4-12 数据看板接口 `/api/v1/admin/analytics/*`（权限 analytics:read）。
 * 全部为只读 GET，数据源走权威业务表聚合、mock 兜底（见 service）。
 *
 * 【会员付费彻底移除·监控改造 §5】营收监控下线：
 *  - 删除 GET /revenue（访问 404，由路由缺失天然返回）；
 *  - overview 移除付费/GMV 字段，新增 aiCallCount；
 *  - funnel 去 report_unlock 改三步；
 *  - 新增 module-usage / module-trend 功能模块使用趋势看板。
 */
@ApiTags('后台-数据分析')
@ApiBearerAuth('admin-token')
@Controller('admin/analytics')
@RequirePerms('analytics:read')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  /**
   * 解析 days：可选，默认 30，范围 1~365。
   * 契约 §6：非数字或越界 → 4000（BAD_REQUEST）。
   */
  private parseDays(days?: string): number {
    if (days === undefined || days === '') return 30;
    const n = Number(days);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 365) {
      throw new BizException(BizCode.BAD_REQUEST, 'days 非法：需为 1~365 的整数');
    }
    return n;
  }

  /** 校验 moduleKey：缺省放行（全部模块），传入必须为合法枚举，否则 → 4000。 */
  private assertModuleKey(moduleKey?: string): string | undefined {
    if (moduleKey === undefined || moduleKey === '') return undefined;
    if (!MODULE_USAGE_KEYS.includes(moduleKey)) {
      throw new BizException(BizCode.BAD_REQUEST, 'moduleKey 非法');
    }
    return moduleKey;
  }

  @Get('overview')
  @ApiOperation({ summary: '总览指标卡（用户/新增/测评/报告/AI 调用合计）' })
  async overview(@Req() req: Request) {
    return ok(await this.analytics.overview(), getTraceId(req), 'ok');
  }

  @Get('growth')
  @ApiOperation({ summary: '用户增长趋势（按天新增注册）' })
  @ApiQuery({ name: 'days', required: false, description: '1~365，默认 30' })
  async growth(@Query('days') days: string, @Req() req: Request) {
    return ok(await this.analytics.growth(this.parseDays(days)), getTraceId(req), 'ok');
  }

  @Get('funnel')
  @ApiOperation({ summary: '核心转化漏斗（测评开始→提交→报告生成，三步）' })
  @ApiQuery({ name: 'days', required: false, description: '1~365，默认 30' })
  async funnel(@Query('days') days: string, @Req() req: Request) {
    return ok(await this.analytics.funnel(this.parseDays(days)), getTraceId(req), 'ok');
  }

  @Get('assessment-rate')
  @ApiOperation({ summary: '测评完成率（assessment_record 源）' })
  @ApiQuery({ name: 'days', required: false, description: '1~365，默认 30' })
  async assessmentRate(@Query('days') days: string, @Req() req: Request) {
    return ok(await this.analytics.assessmentRate(this.parseDays(days)), getTraceId(req), 'ok');
  }

  @Get('module-usage')
  @ApiOperation({ summary: '功能模块使用量分布（近 N 天各模块计数+占比，按 count 降序）' })
  @ApiQuery({ name: 'days', required: false, description: '1~365，默认 30' })
  async moduleUsage(@Query('days') days: string, @Req() req: Request) {
    return ok(await this.analytics.moduleUsage(this.parseDays(days)), getTraceId(req), 'ok');
  }

  @Get('module-trend')
  @ApiOperation({ summary: '功能模块使用趋势（近 N 天按日聚合，北京时区，缺口补 0）' })
  @ApiQuery({ name: 'days', required: false, description: '1~365，默认 30' })
  @ApiQuery({ name: 'moduleKey', required: false, description: '缺省返回全部模块分组；传入则仅该模块，非法→4000' })
  async moduleTrend(
    @Query('days') days: string,
    @Query('moduleKey') moduleKey: string,
  @Req() req: Request,
  ) {
    const d = this.parseDays(days);
    const key = this.assertModuleKey(moduleKey);
    return ok(await this.analytics.moduleTrend(d, key), getTraceId(req), 'ok');
  }
}