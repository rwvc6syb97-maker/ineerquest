import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';

import { InfraModule } from './infra/infra.module';

import { TraceMiddleware } from './common/middleware/trace.middleware';
import { AuthGuard } from './common/guards/auth.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { RateLimitInterceptor } from './common/interceptors/rate-limit.interceptor';
import { QuotaInterceptor } from './common/interceptors/quota.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { AllExceptionFilter } from './common/filters/all-exception.filter';

import { UserModule } from './modules/user/user.module';
import { AssessmentModule } from './modules/assessment/assessment.module';
import { ReportModule } from './modules/report/report.module';
import { CareerModule } from './modules/career/career.module';
import { AiChatModule } from './modules/ai-chat/ai-chat.module';
import { AiReportModule } from './modules/ai-report/ai-report.module';
import { AiCalibrationModule } from './modules/ai-calibration/ai-calibration.module';
import { AiCareerPlanModule } from './modules/ai-career-plan/ai-career-plan.module';
import { AiCoachingModule } from './modules/ai-coaching/ai-coaching.module';
import { AiCollabModule } from './modules/ai-collab/ai-collab.module';
import { AiResumeModule } from './modules/ai-resume/ai-resume.module';
import { AiReportChapterModule } from './modules/ai-report-chapter/ai-report-chapter.module';
import { AiInterviewModule } from './modules/ai-interview/ai-interview.module';
import { DailyBriefModule } from './modules/daily-brief/daily-brief.module';
import { CareerAiModule } from './modules/career-ai/career-ai.module';
import { CoachingModule } from './modules/coaching/coaching.module';
import { PaymentModule } from './modules/payment/payment.module';
import { MembershipModule } from './modules/membership/membership.module';
import { OpsModule } from './modules/ops/ops.module';
import { LlmGatewayModule } from './modules/llm-gateway/llm-gateway.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';

@Module({
imports: [
    InfraModule,
    AnalyticsModule,
    UserModule,
    AssessmentModule,
    ReportModule,
    CareerModule,
    AiChatModule,
    CoachingModule,
    PaymentModule,
    MembershipModule,
    OpsModule,
    LlmGatewayModule,
    RealtimeModule,
    SchedulerModule,
    AiReportModule,
    AiCalibrationModule,
    AiCareerPlanModule,
    AiCoachingModule,
    AiCollabModule,
    AiResumeModule,
    AiReportChapterModule,
    AiInterviewModule,
    DailyBriefModule,
    CareerAiModule,
],
controllers: [AppController],
providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: RateLimitInterceptor },
    { provide: APP_INTERCEPTOR, useClass: QuotaInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionFilter },
],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
