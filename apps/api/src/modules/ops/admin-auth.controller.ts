import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/guards/auth.guard';
import {getTraceId } from '../../common/middleware/trace.middleware';
import { ok } from '../../common/response';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto, AdminRefreshDto } from './admin-auth.dto';

/**
 * AdminAuthController — 运营后台鉴权（独立于 C 端用户体系）。
 *
 * - POST /api/v1/admin/auth/login    后台登录（账号+密码，签发 scope=admin 双 Token）
 * - POST /api/v1/admin/auth/refresh  后台 Token 刷新
 * - POST /api/v1/admin/auth/logout   后台登出（拉黑 token）
 */
@ApiTags('后台-鉴权')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuth: AdminAuthService) {}

  /** 后台登录（独立管理员账号 + 密码） */
  @Public()
  @Post('login')
  async login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    const traceId = getTraceId(req);
    const result = await this.adminAuth.login(dto.username, dto.password);
    return ok(result, traceId, '后台登录成功');
  }

  /** 后台 Token 刷新 */
  @Public()
  @Post('refresh')
  async refresh(@Body() dto: AdminRefreshDto, @Req() req: Request) {
    const traceId = getTraceId(req);
    const result = await this.adminAuth.refresh(dto.refreshToken);
    return ok(result, traceId, '刷新成功');
  }

  /** 后台登出（需登录，拉黑当前 token） */
  @Post('logout')
  async logout(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { refreshToken?: string },
    @Req() req: Request,
  ) {
    const traceId = getTraceId(req);
    const accessToken = (authorization || '').replace(/^Bearer\s+/i, '') || undefined;
    await this.adminAuth.logout(accessToken, body?.refreshToken);
    return ok({ loggedOut: true }, traceId, '已登出');
  }
}