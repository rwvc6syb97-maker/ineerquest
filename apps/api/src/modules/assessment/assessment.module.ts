import { Module } from '@nestjs/common';
import { AssessmentController } from './assessment.controller';
import { AssessmentService } from './assessment.service';
import { ScoringService } from './scoring.service';
import { ReportModule } from '../report/report.module';

/** 测评服务：题库、答卷、MBTI 计分（T1-07~T1-11）；提交后同步创建报告（B1，依赖 ReportModule） */
@Module({
  imports: [ReportModule],
  controllers: [AssessmentController],
  providers: [AssessmentService, ScoringService],
  exports: [AssessmentService, ScoringService],
})
export class AssessmentModule {}