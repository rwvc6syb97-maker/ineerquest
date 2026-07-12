import { Module } from '@nestjs/common';
import { LlmGatewayModule } from '../llm-gateway/llm-gateway.module';
import { CareerAiController } from './career-ai.controller';
import { CareerAiService } from './career-ai.service';

/**
 * §4.4 AI 辅助职业库生产模块（AI 能力拓展 P3，仅管理员）。
 * 依赖 LlmGatewayModule（统一 LLM 出口，含三段式降级）。
 * 护城河：S-04 生成结果只落 career_ai_draft，approve 才事务同步 career/career_skill；
 *        S-05 refSources 招聘平台黑名单拒绝。
 * PrismaService 全局注入，无需显式 import PrismaModule。
 */
@Module({
  imports: [LlmGatewayModule],
  controllers: [CareerAiController],
  providers: [CareerAiService],
})
export class CareerAiModule {}