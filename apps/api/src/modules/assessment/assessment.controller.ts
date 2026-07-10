import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { AssessmentService } from './assessment.service';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { Public } from '../../common/guards/auth.guard';
import { CreateRecordDto, GetQuestionsQueryDto, SaveAnswersDto } from './assessment.dto';

/**
 * AssessmentController — MBTI 测作答链（T1-07~T1-11）。
 * /assessments 前缀；均需登录（AuthGuard 注入 req.user，未加 @Public）。
 */
@ApiTags('测评')
@ApiBearerAuth('user-token')
@Controller('assessments')
export class AssessmentController {
  constructor(private readonly assessment: AssessmentService) {}

  private requireUser(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new BizException(BizCode.TOKEN_INVALID, '未登录或登录已失效');
    }
    return user.userId;
  }

  /** T1-07 拉取题库 GET /api/v1/assessments/questions（游客可访问，方案A） */
  @Public()
  @Get('questions')
  async getQuestions(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Query() query: GetQuestionsQueryDto,
    @Req() req: Request,
  ) {
    return ok(await this.assessment.getQuestions(query.version, query.dimension), getTraceId(req));
  }

  /** T1-08 创建测评记录 POST /api/v1/assessments/records */
  @Post('records')
  async createRecord(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() dto: CreateRecordDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.assessment.createRecord(uid, dto?.version), getTraceId(req), '测评记录已创建');
  }

  /** T1-09 分段暂存答案 PATCH /api/v1/assessments/records/:id/answers */
  @Patch('records/:id/answers')
  async saveAnswers(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') recordId: string,
    @Body() dto: SaveAnswersDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.assessment.saveAnswers(uid, recordId, dto.answers), getTraceId(req), '已暂存');
  }

  /** T1-10 提交计分 POST /api/v1/assessments/records/:id/submit */
  @Post('records/:id/submit')
  async submit(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') recordId: string,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.assessment.submit(uid, recordId), getTraceId(req), '测评已提交');
  }

  /** T1-11 历史测评列表 GET /api/v1/assessments/records */
  @Get('records')
  async listRecords(@CurrentUser() user: CurrentUserPayload | undefined, @Req() req: Request) {
    const uid = this.requireUser(user);
    return ok(await this.assessment.listRecords(uid), getTraceId(req));
  }

  /** T1-11 单次测评结果 GET /api/v1/assessments/records/:id/result */
  @Get('records/:id/result')
  async getResult(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') recordId: string,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.assessment.getResult(uid, recordId), getTraceId(req));
  }
}