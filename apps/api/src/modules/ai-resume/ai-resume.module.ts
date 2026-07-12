import { Module } from '@nestjs/common';
import { LlmGatewayModule } from '../llm-gateway/llm-gateway.module';
import { AiResumeController } from './ai-resume.controller';
import { AiResumeService } from './ai-resume.service';

/**
 * §3.2 AI 简历/求职信生成模块（AI 能力拓展 P2）。
 * 依赖 LlmGatewayModule（统一 LLM 出口，含降级）。
 * 护城河：落 ai_resume_doc 分表，禁写报告本体表。
 * PrismaService 全局注入，无需显式 import PrismaModule。
 */
@Module({
  imports: [LlmGatewayModule],
  controllers: [AiResumeController],
  providers: [AiResumeService],
})
export class AiResumeModule {}