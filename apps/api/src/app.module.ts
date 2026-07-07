import { Module, NestModule, MiddlewareConsumer, CorsModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';

// 基础设施全局模块（Prisma/Redis/Mongo/ClickHouse/OSS）
import { InfraModule } from './infra/infra.module';

// 中间件链（9 层请求管线）
import { TraceMiddleware } from './common/middleware/trace.middleware';
import { AuthGuard } from './common/guards/auth.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { RateLimitInterceptor } from './common/interceptors/rate-limit.interceptor';
import { QuotaInterceptor } from './common/interceptors/quota.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { AllExceptionFilter } from './common/filters/all-exception.filter';

// 10 个服务模块空壳（对齐 Vibe-Coding 执行计划 §2.1 服务模块基线）
import { UserModule } from './modules/user/user.module';
import { AssessmentModule } from './modules/assessment/assessment.module';
import { ReportModule } from './modules/report/report.module';
import { CareerModule } from './modules/career/career.module';
import { AiChatModule } from './modules/ai-chat/ai-chat.module';
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
    CorsModule.forRoot({
      origin: [
        'https://innerquest.tk',
        'https://www.innerquest.tk',
        'http://localhost:5173',
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    }),
    InfraModule, // 基础设施连接层（全局）
    AnalyticsModule, // 埋点服务（全局）：事件上报 event_log + ClickHouse 降级（T1-23）
    UserModule, // 1. 用户服务：认证、资料、隐私、注销
    AssessmentModule, // 2. 测评服务：题库、答卷、MBTI 计分
    ReportModule, // 3. 报告服务：报告生成、解锁、导出
    CareerModule, // 4. 职业规划服务：职业库、推荐、资源、规划
    AiChatModule, // 5. AI 对话服务：会话、消息、SSE、上下文摘要
    CoachingModule, // 6. 辅导咨询服务：辅导师、排期、预约、评价
    PaymentModule, // 7. 支付订单服务：多态下单、支付、关单、退款
    MembershipModule, // 7.1 会员套餐商品：游客可读上架套餐 + 后台 CRUD 与上下架（T2-10）
    OpsModule, // 8. 运营后台服务：后台各页、RBAC、审计
    LlmGatewayModule, // 9. AI 网关 LLMGateway：LLM 调用、Prompt、限流降级
    RealtimeModule, // 10. 实时通信服务：WebSocket/Socket.IO 会话
    SchedulerModule, // 11. 定时任务：注销清理、事件日志TTL、排期释放、激活码过期
  ],
  controllers: [AppController],
  providers: [
    // 第2层 鉴权 Guard（@Public 放行）
    { provide: APP_GUARD, useClass: AuthGuard },
    // 第3层 权限 Guard（@RequirePerms RBAC）
    { provide: APP_GUARD, useClass: PermissionGuard },
    // 拦截器执行顺序：注册顺序 = 进入顺序，返回时逆序
    // 第4层 限流
    { provide: APP_INTERCEPTOR, useClass: RateLimitInterceptor },
    // 第5层 配额
    { provide: APP_INTERCEPTOR, useClass: QuotaInterceptor },
    // 第7层 统一响应包装
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    // 第9层 审计日志
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    // 第8层 全局异常过滤
    { provide: APP_FILTER, useClass: AllExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}