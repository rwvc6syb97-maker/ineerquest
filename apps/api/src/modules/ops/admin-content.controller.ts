import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { AdminContentService } from './admin-content.service';
import {
  ContentActionDto,
  CreateCareerDto,
  CreateResourceDto,
  CreateTopicDto,
  ReviewTopicDto,
  UpdateCareerDto,
  UpdateResourceDto,
  UpdateTopicDto,
} from './admin-content.dto';

/**
 * T4-16 内容管理接口 `/api/v1/admin/content/*`。
 * 职业库 career:read/write；学习资源库 resource:read/write；话题管理 topic:review。
 * 写操作挂 @Audit，删除为敏感操作需 confirm=true；ES 增量索引降级见 service。
 */
@ApiTags('后台-内容')
@ApiBearerAuth('admin-token')
@Controller('admin/content')
export class AdminContentController {
  constructor(private readonly content: AdminContentService) {}

  // ---------- 职业库 ----------

  @Get('careers')
  @RequirePerms('career:read')
  async listCareers(
    @Query('category') category: string,
    @Query('status') status: string,
    @Query('keyword') keyword: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Req() req: Request,
  ) {
    const data = await this.content.listCareers({
      category: category || undefined,
      status: status !== undefined && status !== '' ? Number(status) : undefined,
      keyword: keyword || undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
    return ok(data, getTraceId(req), 'ok');
  }

  @Get('careers/:id')
  @RequirePerms('career:read')
  async careerDetail(@Param('id') id: string, @Req() req: Request) {
    return ok(await this.content.careerDetail(id), getTraceId(req), 'ok');
  }

  @Post('careers')
  @RequirePerms('career:write')
  @Audit('career', 'create')
  async createCareer(@Body() dto: CreateCareerDto, @Req() req: Request) {
    return ok(await this.content.createCareer(dto), getTraceId(req), '职业已创建');
  }

  @Put('careers/:id')
  @RequirePerms('career:write')
  @Audit('career', 'update')
  async updateCareer(@Param('id') id: string, @Body() dto: UpdateCareerDto, @Req() req: Request) {
    setAuditBefore(req, await this.content.careerSnapshot(id));
    return ok(await this.content.updateCareer(id, dto), getTraceId(req), '职业已更新');
  }

  @Delete('careers/:id')
  @RequirePerms('career:write')
  @Audit('career', 'delete')
  async removeCareer(@Param('id') id: string, @Body() dto: ContentActionDto, @Req() req: Request) {
    if (dto?.confirm !== true) {
      throw new BadRequestException('删除为敏感操作，请二次确认（confirm=true）');
    }
    setAuditBefore(req, await this.content.careerSnapshot(id));
    return ok(await this.content.removeCareer(id, dto?.reason), getTraceId(req), '职业已删除');
  }

  // ---------- 学习资源库 ----------

  @Get('resources')
  @RequirePerms('resource:read')
  async listResources(
    @Query('resourceType') resourceType: string,
    @Query('status') status: string,
    @Query('careerId') careerId: string,
    @Query('keyword') keyword: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Req() req: Request,
  ) {
    const data = await this.content.listResources({
      resourceType: resourceType !== undefined && resourceType !== '' ? Number(resourceType) : undefined,
      status: status !== undefined && status !== '' ? Number(status) : undefined,
      careerId: careerId || undefined,
      keyword: keyword || undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
    return ok(data, getTraceId(req), 'ok');
  }

  @Post('resources')
  @RequirePerms('resource:write')
  @Audit('resource', 'create')
  async createResource(@Body() dto: CreateResourceDto, @Req() req: Request) {
    return ok(await this.content.createResource(dto), getTraceId(req), '资源已创建');
  }

  @Put('resources/:id')
  @RequirePerms('resource:write')
  @Audit('resource', 'update')
  async updateResource(@Param('id') id: string, @Body() dto: UpdateResourceDto, @Req() req: Request) {
    setAuditBefore(req, await this.content.resourceSnapshot(id));
    return ok(await this.content.updateResource(id, dto), getTraceId(req), '资源已更新');
  }

  @Delete('resources/:id')
  @RequirePerms('resource:write')
  @Audit('resource', 'delete')
  async removeResource(@Param('id') id: string, @Body() dto: ContentActionDto, @Req() req: Request) {
    if (dto?.confirm !== true) {
      throw new BadRequestException('删除为敏感操作，请二次确认（confirm=true）');
    }
    setAuditBefore(req, await this.content.resourceSnapshot(id));
    return ok(await this.content.removeResource(id, dto?.reason), getTraceId(req), '资源已删除');
  }

  // ---------- 话题管理 ----------

  @Get('topics')
  @RequirePerms('topic:review')
  async listTopics(
    @Query('auditStatus') auditStatus: string,
    @Query('status') status: string,
    @Query('category') category: string,
    @Query('keyword') keyword: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Req() req: Request,
  ) {
    const data = await this.content.listTopics({
      auditStatus: auditStatus !== undefined && auditStatus !== '' ? Number(auditStatus) : undefined,
      status: status !== undefined && status !== '' ? Number(status) : undefined,
      category: category || undefined,
      keyword: keyword || undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
    return ok(data, getTraceId(req), 'ok');
  }

  @Get('topics/:id')
  @RequirePerms('topic:review')
  async topicDetail(@Param('id') id: string, @Req() req: Request) {
    return ok(await this.content.topicDetail(id), getTraceId(req), 'ok');
  }

  @Post('topics')
  @RequirePerms('topic:review')
  @Audit('topic', 'create')
  async createTopic(@Body() dto: CreateTopicDto, @Req() req: Request) {
    const adminId = (req as any).user?.userId;
    return ok(await this.content.createTopic(dto, BigInt(adminId ?? 0)), getTraceId(req), '话题已创建');
  }

  @Put('topics/:id')
  @RequirePerms('topic:review')
  @Audit('topic', 'update')
  async updateTopic(@Param('id') id: string, @Body() dto: UpdateTopicDto, @Req() req: Request) {
    setAuditBefore(req, await this.content.topicSnapshot(id));
    return ok(await this.content.updateTopic(id, dto), getTraceId(req), '话题已更新');
  }

  @Delete('topics/:id')
  @RequirePerms('topic:review')
  @Audit('topic', 'delete')
  async removeTopic(@Param('id') id: string, @Body() dto: ContentActionDto, @Req() req: Request) {
    if (dto?.confirm !== true) {
      throw new BadRequestException('删除为敏感操作，请二次确认（confirm=true）');
    }
    setAuditBefore(req, await this.content.topicSnapshot(id));
    return ok(await this.content.removeTopic(id, dto?.reason), getTraceId(req), '话题已删除');
  }

  @Post('topics/:id/review')
  @RequirePerms('topic:review')
  @Audit('topic', 'review')
  async reviewTopic(@Param('id') id: string, @Body() dto: ReviewTopicDto, @Req() req: Request) {
    setAuditBefore(req, await this.content.topicSnapshot(id));
    return ok(await this.content.reviewTopic(id, dto), getTraceId(req), '话题已审核');
  }
}