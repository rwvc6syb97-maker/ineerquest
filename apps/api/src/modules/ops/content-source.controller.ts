import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok } from '../../common/response';
import { RequirePerms } from '../../common/guards/permission.guard';
import { Audit } from '../../common/interceptors/audit.decorator';
import { ContentSourceService } from './content-source.service';
import { CreateSourceTaskDto, ReviewContentDto, UpdateSourceTaskDto } from './content-source.dto';

/**
 * M1 内容可持续化接口 `/api/v1/admin/content/*`（内容升级 PRD §4.1）。
 * 全部要求管理员鉴权 + 权限点 content:manage（CONTENT_OPS 通过 content:* 通配覆盖）。
 * 返回契约 v2.0 {code,message,data,traceId}；错误码 4600~4605。
 */
@ApiTags('后台-内容可持续化')
@ApiBearerAuth('admin-token')
@Controller('admin/content')
export class ContentSourceController {
  constructor(private readonly svc: ContentSourceService) {}

  private adminId(req: Request): bigint {
    const id = (req as any).user?.userId;
    return BigInt(id ?? 0);
  }

  // ---------- AI 检索任务 ----------

  @Get('source-tasks')
  @RequirePerms('content:manage')
  @ApiOperation({ summary: 'AI 检索任务列表' })
  async listTasks(
    @Query('targetType') targetType: string,
    @Query('status') status: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Req() req: Request,
  ) {
    const data = await this.svc.listTasks({
      targetType: targetType ? Number(targetType) : undefined,
      status: status ? Number(status) : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
    return ok(data, getTraceId(req));
  }

  @Post('source-tasks')
  @RequirePerms('content:manage')
  @Audit('content_source_task', 'create')
  @ApiOperation({ summary: '新建 AI 检索任务' })
  async createTask(@Body() dto: CreateSourceTaskDto, @Req() req: Request) {
    const data = await this.svc.createTask(dto, this.adminId(req));
    return ok(data, getTraceId(req), '任务已创建');
  }

  @Get('source-tasks/:id')
  @RequirePerms('content:manage')
  @ApiOperation({ summary: 'AI 检索任务详情' })
  async taskDetail(@Param('id') id: string, @Req() req: Request) {
    return ok(await this.svc.taskDetail(id), getTraceId(req));
  }

  @Patch('source-tasks/:id')
  @RequirePerms('content:manage')
  @Audit('content_source_task', 'update')
  @ApiOperation({ summary: '更新 AI 检索任务' })
  async updateTask(@Param('id') id: string, @Body()dto: UpdateSourceTaskDto, @Req() req: Request) {
    return ok(await this.svc.updateTask(id, dto), getTraceId(req), '任务已更新');
  }

  @Delete('source-tasks/:id')
  @RequirePerms('content:manage')
  @Audit('content_source_task', 'delete')
  @ApiOperation({ summary: '删除 AI 检索任务' })
  async removeTask(@Param('id') id: string, @Req() req: Request) {
    return ok(await this.svc.removeTask(id), getTraceId(req), '任务已删除');
  }

  @Post('source-tasks/:id/run')
  @RequirePerms('content:manage')
  @Audit('content_source_task', 'run')
  @ApiOperation({ summary: '触发 AI 检索任务（重复触发 4601，结果草稿态待审核）' })
  async runTask(@Param('id') id: string, @Req() req: Request) {
    return ok(await this.svc.runTask(id), getTraceId(req), '任务已触发');
  }

  // ---------- 内容审核流转 ----------

  @Post('careers/:id/review')
  @RequirePerms('content:manage')
  @Audit('career', 'review')
  @ApiOperation({ summary: '职业审核流转（非法流转 4605）' })
  async reviewCareer(@Param('id') id: string, @Body() dto: ReviewContentDto, @Req() req: Request) {
    const data = await this.svc.reviewCareer(id, dto.reviewStatus, dto.remark);
    return ok(data, getTraceId(req), '审核已处理');
  }

  @Post('resources/:id/review')
  @RequirePerms('content:manage')
  @Audit('learning_resource', 'review')
  @ApiOperation({ summary: '学习资源审核流转（非法流转 4605）' })
  async reviewResource(@Param('id') id: string, @Body() dto: ReviewContentDto, @Req() req: Request) {
    const data = await this.svc.reviewResource(id, dto.reviewStatus, dto.remark);
    return ok(data, getTraceId(req), '审核已处理');
  }

  // ---------- 导入 / 导出（CSV, UTF-8 BOM）----------

  @Post('careers/import')
  @RequirePerms('content:manage')
  @Audit('career', 'import')
  @ApiOperation({ summary: '导入职业 CSV（表头非法 4602，行级 failRows）' })
  async importCareers(@Body('content') content: string, @Req() req: Request) {
    const data = await this.svc.importCareers(content ?? '');
    return ok(data, getTraceId(req), '导入完成');
  }

  @Post('resources/import')
  @RequirePerms('content:manage')
  @Audit('learning_resource', 'import')
  @ApiOperation({ summary: '导入学习资源 CSV（表头非法 4602，行级 failRows）' })
  async importResources(@Body('content') content: string, @Req() req: Request) {
    const data = await this.svc.importResources(content ?? '');
    return ok(data, getTraceId(req), '导入完成');
  }

  @Get('careers/export')
  @RequirePerms('content:manage')
  @ApiOperation({ summary: '导出职业 CSV（UTF-8 BOM）' })
  async exportCareers(@Res() res: Response) {
    const { fileName, contentType, content } = await this.svc.exportCareers();
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(content);
  }

  @Get('resources/export')
  @RequirePerms('content:manage')
  @ApiOperation({ summary: '导出学习资源 CSV（UTF-8 BOM）' })
  async exportResources(@Res() res: Response) {
    const { fileName, contentType, content } = await this.svc.exportResources();
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(content);
  }
}