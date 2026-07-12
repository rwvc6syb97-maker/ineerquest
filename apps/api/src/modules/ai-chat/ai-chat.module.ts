import { Module } from '@nestjs/common';
import { LlmGatewayModule } from '../llm-gateway/llm-gateway.module';
import { AiChatController } from './ai-chat.controller';
import { AiChatPersonalizedController } from './ai-chat-personalized.controller';
import { AiChatService } from './ai-chat.service';
import { ContextService } from './context.service';

/**
 * AI 对话服务（T3-04~T3-07）：会话 CRUD、消息 SSE 流式、上下文摘要压缩、50 轮 + 每日配额校验。
 * 依赖 LlmGatewayModule（chat/chatStream）；Prisma/Redis 由全局 InfraModule 提供。
 */
@Module({
  imports: [LlmGatewayModule],
  controllers: [AiChatController, AiChatPersonalizedController],
  providers: [AiChatService, ContextService],
  exports: [AiChatService],
})
export class AiChatModule {}