import { Module } from '@nestjs/common';
import { AssessmentController } from './assessment.controller';
import { AssessmentService } from './assessment.service';
import { ScoringService } from './scoring.service';

/** 测评服务：题库、答卷、MBTI 计分（T1-07~T1-11） */
@Module({
  controllers: [AssessmentController],
  providers: [AssessmentService, ScoringService],
  exports: [AssessmentService, ScoringService],
})
export class AssessmentModule {}