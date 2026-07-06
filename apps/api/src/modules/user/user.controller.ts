import { Body, Controller, Delete, Get, Patch, Post, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { getTraceId } from '../../common/middleware/trace.middleware';
import { ok, BizCode, BizException } from '../../common/response';
import { UserService } from './user.service';
import { UpdateProfileDto } from './auth/auth.dto';
import { CurrentUser, CurrentUserPayload } from './auth/current-user.decorator';

/**
 * UserController — 用户资料/隐私/注销（T1-05）。
 * /users 前缀，需登录（AuthGuard 注入 req.user）。
 */
@ApiTags('用户')
@ApiBearerAuth('user-token')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /** 占位 ping GET /api/v1/users/ping */
  @Get('ping')
  ping() {
    return { code: 0, message: 'user module ready', data: { module: 'user' }, traceId: randomUUID() };
  }

  private requireUser(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new BizException(BizCode.TOKEN_INVALID, '未登录或登录已失效');
    }
    return user.userId;
  }

  /** T1-05 我的资料 GET /api/v1/users/me */
  @Get('me')
  async me(@CurrentUser() user: CurrentUserPayload | undefined, @Req() req: Request) {
    const uid = this.requireUser(user);
    return ok(await this.userService.getProfile(uid), getTraceId(req));
  }

  /** T1-05 更新资料 PATCH /api/v1/users/me */
  @Patch('me')
  async updateMe(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.userService.updateProfile(uid, dto), getTraceId(req), '已更新');
  }

  /** T1-05 隐私设置 GET /api/v1/users/me/privacy */
  @Get('me/privacy')
  async getPrivacy(@CurrentUser() user: CurrentUserPayload | undefined, @Req() req: Request) {
    const uid = this.requireUser(user);
    return ok(await this.userService.getPrivacy(uid), getTraceId(req));
  }

  /** T1-05 更新隐私设置 PATCH /api/v1/users/me/privacy */
  @Patch('me/privacy')
  async updatePrivacy(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() body: Record<string, number>,
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.userService.updatePrivacy(uid, body), getTraceId(req), '已更新');
  }

  /** T1-05 申请注销 POST /api/v1/users/me/deactivation */
  @Post('me/deactivation')
  async deactivate(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() body: { reason?: string },
    @Req() req: Request,
  ) {
    const uid = this.requireUser(user);
    return ok(await this.userService.applyDeactivation(uid, body?.reason), getTraceId(req), '注销申请已提交，进入冷静期');
  }

  /** T1-05 撤销注销 DELETE /api/v1/users/me/deactivation */
  @Delete('me/deactivation')
  async cancelDeactivate(@CurrentUser() user: CurrentUserPayload | undefined, @Req() req: Request) {
    const uid = this.requireUser(user);
    return ok(await this.userService.cancelDeactivation(uid), getTraceId(req), '已撤销注销申请');
  }
}