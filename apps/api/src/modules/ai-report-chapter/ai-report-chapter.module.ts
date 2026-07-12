import { Module } from '@nestjs/common';
import { LlmGatewayModule } from '../llm-gateway/llm-gateway.module';
import { AiReportChapterController } from './ai-report-chapter.controller';
import { AiReportChapterService } from './ai-report-chapter.service';

/**
 * §3.3 深度报告 AI 扩展章节模块（AI 能力拓展 P2）。
 * 依赖 LlmGatewayModule（统一 LLM 出口，含降级）。
 * 护城河：仅落 report_ai_chapter 旁挂表，绝不写 report / report_section 本体表。
 * PrismaService 全局注入，无需显式 import PrismaModule。
 */
@Module({
  imports: [LlmGatewayModule],
  controllers: [AiReportChapterController],
  providers: [AiReportChapterService],
})
export class AiReportChapterModule {}