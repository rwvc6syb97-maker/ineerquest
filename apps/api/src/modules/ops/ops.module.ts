import { Module } from '@nestjs/common';
import { OpsController } from './ops.controller';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminQuestionController } from './admin-question.controller';
import { AdminQuestionService } from './admin-question.service';
import { AdminUserController } from './admin-user.controller';
import { AdminUserService } from './admin-user.service';
import { AdminCoachController } from './admin-coach.controller';
import { AdminCoachService } from './admin-coach.service';
import { AdminContentController } from './admin-content.controller';
import { AdminContentService } from './admin-content.service';
import { AdminActivationCodeController } from './admin-activation-code.controller';
import { MembershipModule } from '../membership/membership.module';

/**
 * 运营后台服务：后台各页、RBAC、审计（T4-10~T4-16）。
 * 依赖 TokenService / SmsCodeService（AuthModule @Global 导出）与 PrismaService（InfraModule 全局）。
 * ActivationCodeService 由 MembershipModule 导出后在此复用。
 */
@Module({
  imports: [MembershipModule],
  controllers: [
    OpsController,
    AdminAuthController,
    AdminAnalyticsController,
    AdminQuestionController,
    AdminUserController,
    AdminCoachController,
    AdminContentController,
    AdminActivationCodeController,
  ],
  providers: [
    AdminAuthService,
    AdminAnalyticsService,
    AdminQuestionService,
    AdminUserService,
    AdminCoachService,
    AdminContentService,
  ],
})
export class OpsModule {}