import { Global, Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

/**
 * T1-23 埋点模块（全局）——供各业务模块 fire-and-forget 上报关键行为。
 * 全局导出 AnalyticsService，避免在每个模块重复 import。
 */
@Global()
@Module({
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}