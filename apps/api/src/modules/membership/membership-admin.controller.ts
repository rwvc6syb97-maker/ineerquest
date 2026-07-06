import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok } from '../../common/response';
import { RequirePerms } from '../../common/guards/permission.guard';
import { MembershipService } from './membership.service';
import { CreatePlanDto, UpdatePlanDto, UpdatePlanStatusDto } from './membership.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

/**
 * MembershipAdminController — 后台会员套餐管理（T2-10）。
 *
 * - GET    /api/v1/admin/membership-plans        列表
 * - GET    /api/v1/admin/membership-plans/:id    详情
 * - POST   /api/v1/admin/membership-plans        创建
 * - PUT    /api/v1/admin/membership-plans/:id    更新
 * - DELETE /api/v1/admin/membership-plans/:id    软删除
 * - PATCH  /api/v1/admin/membership-plans/:id/status  上下架
 *
 * 以 @RequirePerms 声明 RBAC 权限点（真实比对在 PermissionGuard，阶段0 放行占位）。
 */
@ApiTags('后台-会员')
@ApiBearerAuth('admin-token')
@Controller('admin/membership-plans')
@RequirePerms('membership:plan:manage')
export class MembershipAdminController {
  constructor(private readonly membership: MembershipService) {}

  @Get()
  async list(@Req() req: Request) {
    return ok(await this.membership.listAdminPlans(), getTraceId(req), 'ok');
  }

  @Get(':id')
  async detail(@Param('id') id: string, @Req() req: Request) {
    return ok(await this.membership.getAdminPlan(id), getTraceId(req), 'ok');
  }

  @Post()
  async create(@Body() dto: CreatePlanDto, @Req() req: Request) {
    return ok(await this.membership.createPlan(dto), getTraceId(req), '套餐已创建');
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePlanDto, @Req() req: Request) {
    return ok(await this.membership.updatePlan(id, dto), getTraceId(req), '套餐已更新');
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request) {
    return ok(await this.membership.deletePlan(id), getTraceId(req), '套餐已删除');
  }

  /** PATCH /:id/status 上下架 */
  @Patch(':id/status')
  async setStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePlanStatusDto,
    @Req() req: Request,
  ) {
    return ok(await this.membership.updateStatus(id, dto.status), getTraceId(req), '状态已更新');
  }
}