import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok } from '../../common/response';
import { RequirePerms } from '../../common/guards/permission.guard';
import { Audit, setAuditBefore } from '../../common/interceptors/audit.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdminCoachService } from './admin-coach.service';
import { AuditCoachDto, ReviewManageDto, ShelfCoachDto } from './admin-coach.dto';

/**
 * T4-15 辅导师管理接口 `/api/v1/admin/coaches/*`。
 * 审核 coach:audit；上下架 coach:shelf（下线校验进行中订单）；评价管理 review:manage。
 * 写操作挂 @Audit，敏感操作附理由 + 二次确认。
 */
@ApiTags('后台-教练')
@ApiBearerAuth('admin-token')
@Controller('admin/coaches')
export class AdminCoachController {
  constructor(private readonly coaches: AdminCoachService) {}

  @Get()
  @RequirePerms('coach:audit')
  async list(
    @Query('auditStatus') auditStatus: string,
    @Query('status') status: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Req() req: Request,
  ) {
    const data = await this.coaches.list({
      auditStatus: auditStatus !== undefined && auditStatus !== '' ? Number(auditStatus) : undefined,
      status: status !== undefined && status !== '' ? Number(status) : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
    return ok(data, getTraceId(req), 'ok');
  }

  @Get('reviews')
  @RequirePerms('review:manage')
  async listReviews(
    @Query('coachId') coachId: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Req() req: Request,
  ) {
    const data = await this.coaches.listReviews({
      coachId: coachId || undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
    return ok(data, getTraceId(req), 'ok');
  }

  @Get(':id')
  @RequirePerms('coach:audit')
  async detail(@Param('id') id: string, @Req() req: Request) {
    return ok(await this.coaches.detail(id), getTraceId(req), 'ok');
  }

  @Post(':id/audit')
  @RequirePerms('coach:audit')
  @Audit('coach', 'audit')
  async audit(@Param('id') id: string, @Body() dto: AuditCoachDto, @Req() req: Request) {
    if (dto.auditStatus === 2 && !dto.remark) {
      throw new BadRequestException('驳回审核需填写理由');
    }
    setAuditBefore(req, await this.coaches.snapshot(id));
    return ok(await this.coaches.audit(id, dto.auditStatus, dto.remark), getTraceId(req), '审核已提交');
  }

  @Post(':id/shelf')
  @RequirePerms('coach:shelf')
  @Audit('coach', 'shelf')
  async shelf(@Param('id') id: string, @Body() dto: ShelfCoachDto, @Req() req: Request) {
    if (dto.status === 0 && dto.confirm !== true) {
      throw new BadRequestException('下线为敏感操作，请二次确认（confirm=true）');
    }
    setAuditBefore(req, await this.coaches.snapshot(id));
    const data = await this.coaches.shelf(id, dto.status, {
      force: dto.force,
      reason: dto.reason,
    });
    return ok(data, getTraceId(req), dto.status === 1 ? '辅导师已上架' : '辅导师已下线');
  }

  @Post('reviews/:id/reply')
  @RequirePerms('review:manage')
  @Audit('review', 'reply')
  async replyReview(@Param('id') id: string, @Body() dto: ReviewManageDto, @Req() req: Request) {
    if (!dto.reply) throw new BadRequestException('回复内容不能为空');
    setAuditBefore(req, await this.coaches.reviewSnapshot(id));
    return ok(await this.coaches.replyReview(id, dto.reply), getTraceId(req), '评价已回复');
  }

  @Delete('reviews/:id')
  @RequirePerms('review:manage')
  @Audit('review', 'delete')
  async deleteReview(@Param('id') id: string, @Body() dto: ReviewManageDto, @Req() req: Request) {
    setAuditBefore(req, await this.coaches.reviewSnapshot(id));
    return ok(await this.coaches.deleteReview(id, dto?.reason), getTraceId(req), '评价已删除');
  }
}