import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok } from '../../common/response';
import { RequirePerms } from '../../common/guards/permission.guard';
import { Audit, setAuditBefore } from '../../common/interceptors/audit.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdminQuestionService } from './admin-question.service';
import {
  BatchStatusDto,
  CreateQuestionDto,
  ImportQuestionsDto,
  UpdateQuestionDto,
} from './admin-question.dto';

/**
 * T4-13 题库管理接口 `/api/v1/admin/questions/*`。
 * 读接口权限 question:read，写接口权限 question:write。
 * 写操作均挂 @Audit 落审计（admin_op → event_log，前值经 setAuditBefore 快照）。
 * 复用 AssessmentQuestion 的 version 版本隔离与 status 上下架能力。
 */
@ApiTags('后台-题库')
@ApiBearerAuth('admin-token')
@Controller('admin/questions')
export class AdminQuestionController {
  constructor(private readonly questions: AdminQuestionService) {}

  @Get()
  @RequirePerms('question:read')
  async list(
    @Query('version') version: string,
    @Query('status') status: string,
    @Query('dimension') dimension: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Req() req: Request,
  ) {
    const data = await this.questions.list({
      version: version || undefined,
      status: status !== undefined && status !== '' ? Number(status) : undefined,
      dimension: dimension !== undefined && dimension !== '' ? Number(dimension) : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
    return ok(data, getTraceId(req), 'ok');
  }

  @Get(':id')
  @RequirePerms('question:read')
  async detail(@Param('id') id: string, @Req() req: Request) {
    return ok(await this.questions.detail(id), getTraceId(req), 'ok');
  }

  @Post()
  @RequirePerms('question:write')
  @Audit('question', 'create')
  async create(@Body() dto: CreateQuestionDto, @Req() req: Request) {
    return ok(await this.questions.create(dto), getTraceId(req), '题目已创建');
  }

  @Post('import')
  @RequirePerms('question:write')
  @Audit('question', 'import')
  async import(@Body() dto: ImportQuestionsDto, @Req() req: Request) {
    return ok(await this.questions.import(dto), getTraceId(req), '题库已导入');
  }

  @Patch('batch-status')
  @RequirePerms('question:write')
  @Audit('question', 'batch-status')
  async batchStatus(@Body() dto: BatchStatusDto, @Req() req: Request) {
    return ok(await this.questions.batchStatus(dto), getTraceId(req), '批量状态已更新');
  }

  @Put(':id')
  @RequirePerms('question:write')
  @Audit('question', 'update')
  async update(@Param('id') id: string, @Body() dto: UpdateQuestionDto, @Req() req: Request) {
    // 前值快照，供审计拦截器落 before
    setAuditBefore(req, await this.questions.detail(id).catch(() => null));
    return ok(await this.questions.update(id, dto), getTraceId(req), '题目已更新');
  }

  @Delete(':id')
  @RequirePerms('question:write')
  @Audit('question', 'delete')
  async remove(@Param('id') id: string, @Req() req: Request) {
    setAuditBefore(req, await this.questions.detail(id).catch(() => null));
    return ok(await this.questions.remove(id), getTraceId(req), '题目已删除');
  }
}