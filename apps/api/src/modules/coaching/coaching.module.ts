import { Module } from '@nestjs/common';
import { CoachingController } from './coaching.controller';
import { CoachingService } from './coaching.service';

/**
 * 辅导咨询服务：辅导师列表/详情/排期、预约下单（时段锁）、支付确认占用、咨询评价（T4-01~T4-04）。
 * Prisma / Redis / Analytics 均为全局模块，无需在此 imports。
 * confirmAfterPaid 通过 exports 提供给 payment 模块/事件调用。
 */
@Module({
  controllers: [CoachingController],
  providers: [CoachingService],
  exports: [CoachingService],
})
export class CoachingModule {}