import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiProperty } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok } from '../../common/response';
import { Public } from '../../common/guards/auth.guard';
import { StatsService } from './stats.service';

/** GET /stats/home 出参 data（Swagger 文档，字段与 PM 契约严格一致） */
export class HomeStatsDto {
  @ApiProperty({ description: '完成测评人数（已提交且未删除）', example: 1280 })
  completedCount!: number;

  @ApiProperty({ description: '用户满意度：0~100 整数（四舍五入），无评价=0', example: 96 })
  satisfactionRate!: number;

  @ApiProperty({ description: '职业库方向数（上架且未删除）', example: 48 })
  careerCount!: number;

  @ApiProperty({ description: '报告平均评分（保留 1 位小数），无评价=0', example: 4.7 })
  avgReportRating!: number;
}

/**
* StatsController —— 首页真实数据化。
 * /stats 前缀；GET /stats/home 公开（无需登录）。
 */
@ApiTags('统计')
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  /** 首页统计 GET /api/v1/stats/home（公开，5 分钟缓存） */
  @Public()
  @Get('home')
  @ApiOperation({
    summary: '首页统计指标',
    description:
      '公开接口，返回首页四项真实指标：completedCount 完成测评人数、satisfactionRate 用户满意度(0~100整数)、' +
      'careerCount 职业库方向数、avgReportRating 报告平均评分(保留1位小数)。无数据兜底为 0，含 5 分钟内存缓存。',
  })
  @ApiOkResponse({ description: '外层 {code,message,data}，data 为下述结构', type: HomeStatsDto })
  async home(@Req() req: Request) {
    return ok(await this.stats.getHomeStats(), getTraceId(req));
  }
}