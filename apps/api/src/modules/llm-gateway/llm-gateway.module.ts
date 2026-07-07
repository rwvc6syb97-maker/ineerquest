import { Module } from '@nestjs/common';
import { LlmGatewayController } from './llm-gateway.controller';
import { LlmGatewayService } from './llm-gateway.service';
import { MockLlmProvider, OpenAiLlmProvider, OxyGentLlmProvider } from './llm.provider';

/**
 * AI 网关 LLMGateway（T3-01~T3-03）：
 * 统一出口 + 多模型路由 + Prompt 分层编排 + 首 token 超时重试/熔断降级 + Redis 限流降级。
 * 导出 LlmGatewayService 供 report（深度解读）与后续 ai-chat（T3-05）注入。
 * RedisService 由全局 InfraModule 提供。
 */
@Module({
  controllers: [LlmGatewayController],
  providers: [
    LlmGatewayService,
    { provide: MockLlmProvider, useFactory: () => new MockLlmProvider() },
    OpenAiLlmProvider,
    OxyGentLlmProvider,
  ],
  exports: [LlmGatewayService],
})
export class LlmGatewayModule {}