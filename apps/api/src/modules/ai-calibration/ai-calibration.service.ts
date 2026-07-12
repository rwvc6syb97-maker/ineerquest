import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BizCode, BizException } from '../../common/response';
import {
  CALIBRATION_CRITICAL_MAX,
  CALIBRATION_CRITICAL_MIN,
  CALIBRATION_DIMENSION_META,
} from './ai-calibration.constants';
import {
  CalibrationCheckVo,
  CalibrationQuestionVo,
  CalibrationResultVo,
  SubmitCalibrationDto,
} from './ai-calibration.dto';
import { MBTI_DIMENSION_ORDER, DIMENSION_POLES } from '../assessment/assessment.constants';

/**
 * L-P0-3 追问式测评校准服务。
 *
 * 规则纯计算，严禁调用 LLM；严禁触碰报告本体表（report / report_section）。
 * 仅读写 assessment_result 自身的 calibrated / calibrationData 字段。
 *
 *  - GET check：按四维偏好百分比判定临界维度（percent∈[50,55]），返回追问题目；无临界抛 4514。
 *  - POST submit：幂等（calibrated=1 抛 4090）→ 依追问答案覆盖临界维度倾向重算 MBTI → 落 calibrated=1 + calibrationData。
 *
 * 数据隔离：所有查询以 userId 为条件，用户只能校准自己的结果。
 */
@Injectable()
export class AiCalibrationService {
  private readonly logger = new Logger(AiCalibrationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 按 result 归属加载（数据隔离），不存在/非本人抛 4203。 */
  private async mustOwnResult(userId: string, resultId: string) {
    let idBig: bigint;
    try {
      idBig = BigInt(resultId);
    } catch {
      throw new BizException(BizCode.ASSESSMENT_RECORD_NOT_FOUND, '测评结果不存在', 200);
    }
    const row = await this.prisma.assessmentResult.findFirst({
      where: { id: idBig, userId: BigInt(userId) },
    });
    if (!row) {
      throw new BizException(BizCode.ASSESSMENT_RECORD_NOT_FOUND, '测评结果不存在或无权访问', 200);
    }
    return row;
  }

  /** 维度键 → 该维度当前偏好百分比（0-100）。 */
  private percentOf(row: { scoreEi: unknown; scoreSn: unknown; scoreTf: unknown; scoreJp: unknown }): Record<string, number> {
    return {
      EI: Number(row.scoreEi),
      SN: Number(row.scoreSn),
      TF: Number(row.scoreTf),
      JP: Number(row.scoreJp),
    };
  }

  /** 判定临界维度键列表（percent 落在 [MIN, MAX]）。 */
  private criticalDimensions(percents: Record<string, number>): string[] {
    return Object.keys(CALIBRATION_DIMENSION_META).filter((k) => {
      const p = percents[k];
      return p >= CALIBRATION_CRITICAL_MIN && p <= CALIBRATION_CRITICAL_MAX;
    });
  }

  /**
   * GET 校准判定：返回临界维度追问题目。
   * 无临界维度 → 抛 NO_NEED_CALIBRATE(4514)。
   */
  async check(userId: string, resultId: string): Promise<CalibrationCheckVo> {
    const row = await this.mustOwnResult(userId, resultId);
    const percents = this.percentOf(row);
    const criticalKeys = this.criticalDimensions(percents);

    if (criticalKeys.length === 0) {
      throw new BizException(BizCode.NO_NEED_CALIBRATE, '各维度倾向清晰，无需追问校准', 200);
    }

    const questions: CalibrationQuestionVo[] = criticalKeys.map((k) => {
      const meta = CALIBRATION_DIMENSION_META[k];
      return {
        dimension: k,
        currentPercent: percents[k],
        question: meta.question,
        options: [
          { choice: 'first', label: meta.optionFirst },
          { choice: 'second', label: meta.optionSecond },
        ],
      };
    });

    return {
      resultId: row.id.toString(),
      mbtiType: row.mbtiType,
      calibrated: row.calibrated === 1,
      questions,
    };
  }

  /**
   * POST 提交追问答案：重算并落库。
   * 幂等：已校准（calibrated=1）抛 DUPLICATE_SUBMIT(4090)。
   * 仅接受临界维度答案；非临界维度传入将被忽略（不影响原判定）。
   */
  async submit(userId: string, resultId: string, dto: SubmitCalibrationDto): Promise<CalibrationResultVo> {
    const row = await this.mustOwnResult(userId, resultId);

    if (row.calibrated === 1) {
      throw new BizException(BizCode.DUPLICATE_SUBMIT, '该测评结果已完成校准，请勿重复提交', 200);
    }

    const percents = this.percentOf(row);
    const criticalKeys = this.criticalDimensions(percents);
    if (criticalKeys.length === 0) {
      throw new BizException(BizCode.NO_NEED_CALIBRATE, '各维度倾向清晰，无需追问校准', 200);
    }

    // 依追问答案覆盖临界维度字母，重算 MBTI。仅处理属于临界集合的答案。
    const originalType = row.mbtiType;
    const letters: Record<number, string> = {};
    for (const dim of MBTI_DIMENSION_ORDER) {
      // 默认沿用原类型对应位字母
      letters[dim] = originalType[MBTI_DIMENSION_ORDER.indexOf(dim)] ?? '';
    }
    const applied: Array<{ dimension: string; choice: string; letter: string }> = [];
    for (const ans of dto.answers) {
      if (!criticalKeys.includes(ans.dimension)) continue;
      const meta = CALIBRATION_DIMENSION_META[ans.dimension];
      const poles = DIMENSION_POLES[meta.dimension];
      const letter = ans.choice === 'first' ? poles[0] : poles[1];
      letters[meta.dimension] = letter;
      applied.push({ dimension: ans.dimension, choice: ans.choice, letter });
    }

    const calibratedType = MBTI_DIMENSION_ORDER.map((d) => letters[d]).join('');
    const changed = calibratedType !== originalType;

    const calibrationData = {
      originalType,
      calibratedType,
      criticalDimensions: criticalKeys,
      answers: applied,
      calibratedAt: new Date().toISOString(),
    };

    await this.prisma.assessmentResult.update({
      where: { id: row.id },
      data: {
        calibrated: 1,
        calibrationData,
      },
    });

    return {
      resultId: row.id.toString(),
      originalType,
      calibratedType,
      changed,
    };
  }
}