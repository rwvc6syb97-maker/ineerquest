import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok } from '../../common/response';
import { RequirePerms } from '../../common/guards/permission.guard';
import { Audit, setAuditBefore } from '../../common/interceptors/audit.decorator';
import { hasPermission } from './admin-rbac.constants';
import { AdminUserService } from './admin-user.service';
import { BanUserDto, UnbanUserDto } from './admin-user.dto';

/**
 * T4-14 用户管理接口 `/api/v1/admin/users/*`。
 * 列表/详情 user:read（默认脱敏，持 user:pii 方可明文）；封禁/解封 user:ban。
 * 封禁触发强制下线，需二次确认 + 操作理由，写操作挂 @Audit。
 */
@ApiTags('后台-用户')
@ApiBearerAuth('admin-token')
@Controller('admin/users')
export class AdminUserController {
  constructor(private readonly users: AdminUserService) {}

  /** 判定当前操作者是否持有 user:pii（明文 PII）权限。 */
  private canPii(req: Request): boolean {
    const perms = (req as unknown as { user?: { perms?: string[] } }).user?.perms;
    return hasPermission(perms, ['user:pii']);
  }

  @Get()
  @RequirePerms('user:read')
  async list(
    @Query('status') status: string,
    @Query('role') role: string,
    @Query('keyword') keyword: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Req() req: Request,
  ) {
    const data = await this.users.list({
      status: status !== undefined && status !== '' ? Number(status) : undefined,
      role: role !== undefined && role !== '' ? Number(role) : undefined,
      keyword: keyword || undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      pii: this.canPii(req),
    });
    return ok(data, getTraceId(req), 'ok');
  }

  @Get(':id')
  @RequirePerms('user:read')
  async detail(@Param('id') id: string, @Req() req: Request) {
    return ok(await this.users.detail(id, this.canPii(req)), getTraceId(req), 'ok');
  }

  @Post(':id/ban')
  @RequirePerms('user:ban')
  @Audit('user', 'ban')
  async ban(@Param('id') id: string, @Body() dto: BanUserDto, @Req() req: Request) {
    if (dto.confirm !== true) {
      throw new BadRequestException('封禁为敏感操作，请二次确认（confirm=true）');
    }
    setAuditBefore(req, await this.users.snapshot(id));
    return ok(await this.users.ban(id, dto.reason), getTraceId(req), '用户已封禁并强制下线');
  }

  @Post(':id/unban')
  @RequirePerms('user:ban')
  @Audit('user', 'unban')
  async unban(@Param('id') id: string, @Body() dto: UnbanUserDto, @Req() req: Request) {
    setAuditBefore(req, await this.users.snapshot(id));
    return ok(await this.users.unban(id, dto.reason), getTraceId(req), '用户已解封');
  }
}