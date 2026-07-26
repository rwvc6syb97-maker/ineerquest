import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

/** 首页统计模块：GET /stats/home 公开真实指标（PrismaService 由全局 InfraModule 提供） */
@Module({
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}