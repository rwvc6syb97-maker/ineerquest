import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { ReportService } from './report.service';
import { CreateShareDto, GenerateDeepContentDto, GenerateReportDto, GetReportQueryDto, ListReportsQueryDto, ReportOverviewDto, CreateFeedbackDto, ReportFeedbackResultDto, ExportBatchDto } from './report.dto';

/**
 * ReportController — 报告生成/查询/分享（T1-14 / T1-15 / T1-17）。
 * /reports 前缀；均需登录。
 */
@ApiTags('报告')
@ApiBearerAuth('user-token')
@Controller('reports')
export class ReportController {
  constructor(private readonly report: ReportService) {}

  private requireUser(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new BizException(BizCode.TOKEN_INVALID, '未登录或登录已失效');
    }
    return user.userId;
  }

  /** T1-14 生成报告 POST /api/v1/reports */
  @Post()
  async generate(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() dto: GenerateReportDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.report.generate(uid, dto.recordId), getTraceId(req), '报告已生成');
  }

  /** 报告列表 GET /api/v1/reports（PM 裁定 P0：历史页依赖，userId 隔离 + 软删除 + 分页） */
  @Get()
  @ApiOperation({
    summary: '报告列表',
    description:
      '当前登录用户的报告列表（软删除过滤，按 createdAt 倒序分页）。' +
      '返回 {list, total, page, pageSize}，list 项复用 GET /reports/:id 概览结构。默认 page=1/pageSize=10。',
  })
  async listReports(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Query() query: ListReportsQueryDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(
      await this.report.listReportsForOwner(uid, query.page, query.pageSize),
      getTraceId(req),
    );
  }

  /**
   * M2 批量导出 POST /api/v1/reports/export/batch
   * 静态段必须置于 ':id' 动态段之前，避免 'export' 被当作 :id 匹配。
   * reportIds 1~50；空 4610 / 超 50 4611 / 含他人报告 4003 整批拒绝，均由 service 判定。
   * 同步生成 zip 并落内存任务，返回 {taskId, count, status}。
   */
  @Post('export/batch')
  @ApiOperation({
    summary: '批量导出报告(zip)',
    description:
      'reportIds 1~50 份，同源 reportView→PDF→zip 打包。空数组 4610 / 超 50 4611 / 含他人报告 4003 整批拒绝。' +
      '返回 {taskId, count, status:"done"}，随后用 GET /reports/export/batch/:taskId 拉取 zip。',
  })
  async exportBatch(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() dto: ExportBatchDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.report.exportBatch(uid, dto?.reportIds), getTraceId(req), '批量导出已生成');
  }

  /**
   * M2 拉取批量导出结果 GET /api/v1/reports/export/batch/:taskId
   * userId 隔离：仅发起者可拉取；不存在/过期 4004、越权 4003。以 zip 二进制流返回。
   */
  @Get('export/batch/:taskId')
  @ApiOperation({ summary: '拉取批量导出结果(zip)', description: '返回 zip 二进制流；不存在/过期 4004，越权 4003。' })
  async getBatchTask(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('taskId') taskId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const uid = this.requireUser(user);
    const { fileName, contentType, base64 } = await this.report.getBatchTask(uid, taskId);
    const buf = Buffer.from(base64, 'base64');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buf.length.toString());
    return res.send(buf);
  }

  /** T1-15 查询报告 GET /api/v1/reports/:id */
  @Get(':id')
  @ApiOperation({
    summary: 'T1-15 查询报告概览',
    description:
      '返回 v2.1 权威概览结构（id/recordId/reportNo/mbtiType/family/summary/dimensions/generateStatus/sections/createdAt）。' +
      '免费化后全部段落 content 恒返回。',
  })
  @ApiOkResponse({ description: '概览出参（外层 {code,message,data}，data 为下述结构）', type: ReportOverviewDto })
  async getReport(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') reportId: string,
    @Query() query: GetReportQueryDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(
      await this.report.getReportForOwner(uid, reportId, query.sectionKey),
      getTraceId(req),
    );
  }

  /** T1-17 生成分享 POST /api/v1/reports/:id/share */
  @Post(':id/share')
  async share(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') reportId: string,
    @Body() dto: CreateShareDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.report.createShare(uid, reportId, dto?.channel), getTraceId(req), '分享已创建');
  }

  /** 报告反馈 POST /api/v1/reports/:id/feedback（需登录） */
  @Post(':id/feedback')
  @ApiOperation({
    summary: '提交报告反馈（评分/满意度）',
    description:
      '需登录。Body:{rating(1~5整数,必填), content?(≤200字)}。返回 {feedbackId, rating, isSatisfied}。' +
      'isSatisfied 由后端按 rating>=4 计算，前端不得传入。' +
      '错误码：4310 评分缺失 / 4311 评分越界 / 4312 反馈超长 / 4313 报告不存在 / 4314 越权 / 4315 重复提交(改用 PATCH)。',
  })
  @ApiOkResponse({ description: '外层 {code,message,data}，data 为下述结构', type: ReportFeedbackResultDto })
  async submitFeedback(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') reportId: string,
    @Body() dto: CreateFeedbackDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(
      await this.report.submitFeedback(uid, reportId, dto?.rating, dto?.content),
      getTraceId(req),
      '反馈已提交',
    );
  }

  /**
   * T2-06 报告 PDF 导出 GET /api/v1/reports/:id/export
   * 直接以二进制流返回 PDF（passthrough），未解锁抛 40002 由异常过滤器兜底。
   */
  @Get(':id/export')
  async exportPdf(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') reportId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const uid = this.requireUser(user);
    const { fileName, contentType, base64 } = await this.report.exportPdf(uid, reportId);
    const buf = Buffer.from(base64, 'base64');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buf.length.toString());
    return res.send(buf);
  }

  /**
   * M2 报告视图 GET /api/v1/reports/:id/view
   * reportView 单一数据源（与 PDF 导出严格同源，PRD §4.1 冻结结构）。
   * 越权 4003 / 不存在 4004（由 service 判定）。
   */
  @Get(':id/view')
  @ApiOperation({
    summary: '报告视图(reportView)',
    description:
      'PRD §4.1 冻结结构：{reportId, reportType, personalityType, groupName, groupColor, createdAt, ' +
      'dimensions[], sections[], careerMatches[], meta{version, generatedAt}}。与导出 PDF 严格同源。越权 4003 / 不存在 4004。',
  })
  async getReportView(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') reportId: string,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.report.buildReportView(uid, reportId), getTraceId(req));
  }

  /** §6.1 #2 章节列表 GET /api/v1/reports/:id/sections */
  @Get(':id/sections')
  async getSections(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') reportId: string,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.report.getSectionsForOwner(uid, reportId), getTraceId(req));
  }

  /** §6.1 #3 章节详情 GET /api/v1/reports/:id/sections/:sectionKey */
  @Get(':id/sections/:sectionKey')
  async getSectionDetail(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') reportId: string,
    @Param('sectionKey') sectionKey: string,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.report.getSectionDetail(uid, reportId, sectionKey), getTraceId(req));
  }

  /** §6.1 #4 触发 LLM 深度生成 POST /api/v1/reports/:id/generate */
  @Post(':id/generate')
  async generateDeep(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') reportId: string,
    @Body() dto: GenerateDeepContentDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(
      await this.report.generateDeepContent(uid, reportId, dto.sections),
      getTraceId(req),
      '深度生成已触发',
    );
  }
}