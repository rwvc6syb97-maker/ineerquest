import { Module } from '@nestjs/common';
import { LlmGatewayModule } from '../llm-gateway/llm-gateway.module';
import { AiInterviewController } from './ai-interview.controller';
import { AiInterviewService } from './ai-interview.service';
import { InterviewBankController } from './interview-bank.controller';
import { InterviewBankService } from './interview-bank.service';

/**
 * §4.1 AI 模拟面试 + §4.2 面试题库/评分模块（AI 能力拓展 P3）。
 * 依赖 LlmGatewayModule（统一 LLM 出口，含三段式降级）。
 * 护城河：结果只落 ai_interview + ai_interview_qa 分表；题库仅读 interview_question 已发布题，禁写其他业务表。
 * PrismaService 全局注入，无需显式 import PrismaModule。
 */
@Module({
  imports: [LlmGatewayModule],
  controllers: [AiInterviewController, InterviewBankController],
  providers: [AiInterviewService, InterviewBankService],
})
export class AiInterviewModule {}