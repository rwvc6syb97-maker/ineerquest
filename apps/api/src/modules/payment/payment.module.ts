import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { WechatPayAdapter } from './pay-channel.adapter';
import { CoachingModule } from '../coaching/coaching.module';

/**
 * 支付订单服务：多态下单、支付、15 分钟关单、回调幂等、退款（T2-01~T2-04 / T2-07）。
 * Prisma / Redis / Analytics 均为全局模块，无需在此 imports。
 * 导入 CoachingModule 以在咨询订单（bizType=2）支付回调成功后调用 confirmAfterPaid 确认时段占用。
 */
@Module({
  imports: [CoachingModule],
  controllers: [PaymentController],
  providers: [PaymentService, WechatPayAdapter],
  exports: [PaymentService],
})
export class PaymentModule {}