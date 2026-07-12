import { Module } from '@nestjs/common';
import { LlmGatewayModule } from '../llm-gateway/llm-gateway.module';
import { AiCareerPlanController } from './ai-career-plan.controller';
import { AiCareerPlanService } from './ai-career-plan.service';

/**
 * §2.1 AI 动态成长计划模块（AI 能力拓展 P1）。
 * 依赖 LlmGatewayModule（统一 LLM 出口，含降级）。
 * 护城河：落 career_growth_plan 分表，禁写 career_roadmap。
 * PrismaService 全局注入，无需显式 import PrismaModule。
 */
@Module({
  imports: [LlmGatewayModule],
  controllers: [AiCareerPlanController],
  providers: [AiCareerPlanService],
})
export class AiCareerPlanModule {}