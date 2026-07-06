import { Module } from '@nestjs/common';
import { MembershipController } from './membership.controller';
import { MembershipAdminController } from './membership-admin.controller';
import { MembershipService } from './membership.service';
import { ActivationCodeService } from './activation-code.service';

/**
 * 会员套餐 + 激活码模块。
 * Prisma / Redis 为全局模块，无需在此 imports。
 */
@Module({
  controllers: [MembershipController, MembershipAdminController],
  providers: [MembershipService, ActivationCodeService],
  exports: [MembershipService, ActivationCodeService],
})
export class MembershipModule {}