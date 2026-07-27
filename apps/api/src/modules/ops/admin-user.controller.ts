import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
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

  /**
   * 批量 Excel 汇总导出 GET /admin/users/export
   * 一行一用户(信息+MBTI类型+四维度)，筛选参数复用 list。
   * 文件流返回；PII 依 user:pii 权限脱敏。路由须先于 `:id` 声明避免被误匹配。
   */
  @Get('export')
  @RequirePerms('user:read')
  async exportUsers(
    @Query('status') status: string,
    @Query('role') role: string,
    @Query('keyword') keyword: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.users.exportUsersSheet({
      status: status !== undefined && status !== '' ? Number(status) : undefined,
      role: role !== undefined && role !== '' ? Number(role) : undefined,
      keyword: keyword || undefined,
      pii: this.canPii(req),
    });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Content-Length', file.buffer.length.toString());
    return res.send(file.buffer);
  }

  /**
   * 单用户 PDF 详版导出 GET /admin/users/:id/report/export?format=pdf
   * 内容=该用户最新 MBTI 报告全文 + 四维度得分。文件流返回；PII 依 user:pii 权限脱敏。
   */
  @Get(':id/report/export')
  @RequirePerms('user:read')
  async exportUserReport(
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.users.exportUserReportPdf(id, this.canPii(req));
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Content-Length', file.buffer.length.toString());
    return res.send(file.buffer);
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