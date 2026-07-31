import { Module } from '@nestjs/common';
import { LlmGatewayModule } from '../llm-gateway/llm-gateway.module';
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
import { ContentSourceController } from './content-source.controller';
import { ContentSourceService } from './content-source.service';
import { WebSearchService } from './web-search.service';

/**
 * 运营后台服务：后台各页、RBAC、审计（T4-10~T4-16）。
 * 依赖 TokenService / SmsCodeService（AuthModule @Global 导出）与 PrismaService（InfraModule 全局）。
 * 内容可持续化 M1：LlmGatewayModule 提供 AI 检索能力，ContentSourceController 注册在
 * AdminContentController 之前，确保 careers/resources 的 import|export 静态段先于 :id 动态段匹配。
 */
@Module({
  imports: [LlmGatewayModule],
  controllers: [
    OpsController,
    AdminAuthController,
    AdminAnalyticsController,
    AdminQuestionController,
    AdminUserController,
    AdminCoachController,
    ContentSourceController,
    AdminContentController,
  ],
  providers: [
    AdminAuthService,
    AdminAnalyticsService,
    AdminQuestionService,
    AdminUserService,
    AdminCoachService,
    AdminContentService,
    ContentSourceService,
    WebSearchService,
  ],
})
export class OpsModule {}