import { Module } from '@nestjs/common';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { LlmGatewayModule } from '../llm-gateway/llm-gateway.module';

/** 报告服务：生成、查询解锁过滤、分享海报（T1-14 / T1-15 / T1-17）；深度解读经 LLMGateway（T3-01） */
@Module({
  imports: [LlmGatewayModule],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}