import { Module } from '@nestjs/common';
import { DailyBriefController } from './daily-brief.controller';
import { DailyBriefService } from './daily-brief.service';

/**
 * §4.3 AI 职业热点日报模块（AI 能力拓展 P3，登录可见）。
 * 护城河：仅读 daily_brief 已发布日报、写 daily_brief_subscription 分表，禁写其他业务表。
 * 内容由 scheduler 后台生成（本模块不含生成逻辑）。
 * PrismaService 全局注入，无需显式 import PrismaModule。
 */
@Module({
  controllers: [DailyBriefController],
  providers: [DailyBriefService],
})
export class DailyBriefModule {}