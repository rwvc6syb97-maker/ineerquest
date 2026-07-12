import { Module } from '@nestjs/common';
import { ReportModule } from '../report/report.module';
import { LlmGatewayModule } from '../llm-gateway/llm-gateway.module';
import { AiReportController } from './ai-report.controller';
import { AiReportService } from './ai-report.service';

/**
 * L-P0-1 报告人话翻译模块（AI 增值层）。
 * 依赖 ReportModule（只读 getReportForOwner）与 LlmGatewayModule（chat 非流式）。
 * 不新增任何表、不侵入报告本体。
 */
@Module({
  imports: [ReportModule, LlmGatewayModule],
  controllers: [AiReportController],
  providers: [AiReportService],
})
export class AiReportModule {}