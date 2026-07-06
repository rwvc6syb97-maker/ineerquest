import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../../common/guards/auth.guard';
import { getTraceId } from '../../../common/middleware/trace.middleware';
import { ok } from '../../../common/response';
import { SmsCodeService } from './sms-code.service';
import { AuthService } from './auth.service';
import { SendSmsDto, LoginDto, EmailRegisterDto, EmailLoginDto, RefreshDto } from './auth.dto';

/**
 * AuthController — 认证链接口（T1-01~T1-04）。
 * 全部挂在 /api/v1/auth 前缀下，复用 9 层中间件链与统一响应。
 * 支持手机号+验证码登录、邮箱+密码注册/登录。
 */
@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly smsCode: SmsCodeService,
    private readonly auth: AuthService,
  ) {}

  /** T1-01 发送短信验证码 POST /api/v1/auth/sms/send */
  @Public()
  @Post('sms/send')
  async sendSms(@Body() dto: SendSmsDto, @Req() req: Request) {
    const traceId = getTraceId(req);
    const { ttl, blocked, devCode } = await this.smsCode.send(dto.phone);
    return ok({ sent: true, ttl, blocked, devCode }, traceId, '验证码已发送');
  }

  /** T1-02 手机号登录 POST /api/v1/auth/login */
  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const traceId = getTraceId(req);
    const result = await this.auth.loginByPhone(dto.phone, dto.code);
    return ok(result, traceId, '登录成功');
  }

  /** 邮箱注册 POST /api/v1/auth/email/register */
  @Public()
  @Post('email/register')
  async emailRegister(@Body() dto: EmailRegisterDto, @Req() req: Request) {
    const traceId = getTraceId(req);
    const result = await this.auth.registerByEmail(dto.email, dto.password, dto.nickname);
    return ok(result, traceId, '注册成功');
  }

  /** 邮箱登录 POST /api/v1/auth/email/login */
  @Public()
  @Post('email/login')
  async emailLogin(@Body() dto: EmailLoginDto, @Req() req: Request) {
    const traceId = getTraceId(req);
    const result = await this.auth.loginByEmail(dto.email, dto.password);
    return ok(result, traceId, '登录成功');
  }

  /** T1-04 刷新 Token POST /api/v1/auth/refresh */
  @Public()
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    const traceId = getTraceId(req);
    const { accessToken, refreshToken, user } = await this.auth.refresh(dto.refreshToken);
    return ok({ accessToken, refreshToken, user }, traceId, '刷新成功');
  }

  /** T1-04 登出 POST /api/v1/auth/logout（需登录，拉黑当前 token） */
  @Post('logout')
  async logout(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { refreshToken?: string },
    @Req() req: Request,
  ) {
    const traceId = getTraceId(req);
    const accessToken = (authorization || '').replace(/^Bearer\s+/i, '') || undefined;
    await this.auth.logout(accessToken, body?.refreshToken);
    return ok({ loggedOut: true }, traceId, '已登出');
  }
}