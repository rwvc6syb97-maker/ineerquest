import { Module } from '@nestjs/common';
import { LlmGatewayModule } from '../llm-gateway/llm-gateway.module';
import { AiCollabController } from './ai-collab.controller';
import { AiCollabService } from './ai-collab.service';

/**
 * §3.1 AI 协作分析模块（AI 能力拓展 P2）。
 * 依赖 LlmGatewayModule（统一 LLM 出口，含降级）。
 * PrismaService/RedisService/TokenService 均为全局提供，无需显式 import。
 */
@Module({
  imports: [LlmGatewayModule],
  controllers: [AiCollabController],
  providers: [AiCollabService],
})
export class AiCollabModule {}