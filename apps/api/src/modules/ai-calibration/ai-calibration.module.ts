import { Module } from '@nestjs/common';
import { AiCalibrationController } from './ai-calibration.controller';
import { AiCalibrationService } from './ai-calibration.service';

/**
 * L-P0-3 追问式测评校准模块。
 * 纯规则计算，无 LLM 依赖；Prisma 由全局 InfraModule 提供。
 * 仅读写 assessment_result 自身 calibrated/calibrationData，绝不触碰报告本体表。
 */
@Module({
  controllers: [AiCalibrationController],
  providers: [AiCalibrationService],
})
export class AiCalibrationModule {}