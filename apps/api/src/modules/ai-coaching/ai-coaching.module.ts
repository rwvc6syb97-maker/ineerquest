import { Module } from '@nestjs/common';
import { LlmGatewayModule } from '../llm-gateway/llm-gateway.module';
import { AiCoachingController } from './ai-coaching.controller';
import { AiCoachingService } from './ai-coaching.service';

/**
 * §2.2~2.4 AI 辅导模块（AI 能力拓展 P1）。
 * 依赖 LlmGatewayModule；护城河：落 coaching_pre_brief / coaching_summary 分表，逻辑关联无物理外键。
 * PrismaService 全局注入，无需显式 import PrismaModule。
 */
@Module({
  imports: [LlmGatewayModule],
  controllers: [AiCoachingController],
  providers: [AiCoachingService],
})
export class AiCoachingModule {}