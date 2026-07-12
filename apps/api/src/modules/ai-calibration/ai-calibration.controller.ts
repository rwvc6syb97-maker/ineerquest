import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { AiCalibrationService } from './ai-calibration.service';
import { SubmitCalibrationDto } from './ai-calibration.dto';

/**
 * L-P0-3 追问式测评校准（登录 + 数据隔离）。
 *  - GET  /api/v1/ai/assessment/calibration/:resultId —— 判定临界维度并返回追问题目；无临界返 4514。
 *  - POST /api/v1/ai/assessment/calibration/:resultId —— 提交追问答案，重算并落 calibrated/calibrationData；重复提交返 4090。
 *
 * 护城河：纯规则计算，绝不调用 LLM，绝不触碰报告本体表。
 */
@ApiTags('AI测评校准')
@ApiBearerAuth('user-token')
@Controller('ai/assessment/calibration')
export class AiCalibrationController {
  constructor(private readonly calibration: AiCalibrationService) {}

  private requireUser(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new BizException(BizCode.TOKEN_INVALID, '未登录或登录已失效');
    }
    return user.userId;
  }

  /** GET 校准判定：返回临界维度追问题目。 */
  @Get(':resultId')
  @ApiOperation({
    summary: '追问式校准判定',
    description: '判定四维临界维度并返回追问题目；各维度倾向清晰时返回 4514（无需校准）。',
  })
  @ApiParam({ name: 'resultId', description: '测评结果 ID（须为本人）' })
  @ApiResponse({ status: 200, description: '统一返回结构 {code,message,data,traceId}' })
  async check(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('resultId') resultId: string,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.calibration.check(uid, resultId), getTraceId(req));
  }

  /** POST 提交追问答案：重算并落库。 */
  @Post(':resultId')
  @ApiOperation({
    summary: '提交追问校准答案',
    description: '按追问答案覆盖临界维度倾向重算 MBTI，落 calibrated=1 与 calibrationData；重复提交返回 4090。',
  })
  @ApiParam({ name: 'resultId', description: '测评结果 ID（须为本人）' })
  @ApiResponse({ status: 200, description: '统一返回结构 {code,message,data,traceId}' })
  async submit(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('resultId') resultId: string,
    @Body() dto: SubmitCalibrationDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.calibration.submit(uid, resultId, dto), getTraceId(req), '校准已完成');
  }
}