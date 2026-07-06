import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';

/**
 * SchedulerModule — 定时任务（BE-11）。
 * 引入 @nestjs/schedule 驱动所有 @Cron 装饰器。
 * PrismaService 由 InfraModule @Global 导出，直接注入。
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [SchedulerService],
})
export class SchedulerModule {}
