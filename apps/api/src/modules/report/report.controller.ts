import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { CurrentUser, CurrentUserPayload } from '../user/auth/current-user.decorator';
import { ReportService } from './report.service';
import { CreateShareDto, GenerateDeepContentDto, GenerateReportDto, GetReportQueryDto, ReportOverviewDto } from './report.dto';

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

  /** T1-15 查询报告 GET /api/v1/reports/:id */
  @Get(':id')
  @ApiOperation({
    summary: 'T1-15 查询报告概览',
    description:
      '返回 v2.1 权威概览结构（id/recordId/reportNo/mbtiType/family/summary/dimensions/generateStatus/sections/lockedSectionKeys/isUnlocked/createdAt）。' +
      '未解锁仅返回免费段落；带 sectionKey 访问付费段且未解锁 → 43xx REPORT_LOCKED。',
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

  /** T2-05 报告解锁 POST /api/v1/reports/:id/unlock */
  @Post(':id/unlock')
  async unlock(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Param('id') reportId: string,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.report.unlock(uid, reportId), getTraceId(req), '报告已解锁');
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