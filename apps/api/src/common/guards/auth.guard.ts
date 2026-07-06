import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { TokenService } from '../../modules/user/auth/token.service';
import { BizCode, BizException } from '../response';

/** 标记接口为公开（跳过鉴权），如 /health、登录、支付回调 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

/**
 * 第 2 层 · Auth 守卫（JWT 鉴权 + 黑名单）
 * T1-02/T1-04 接线：校验 access token 签名/有效期，命中黑名单拒绝，注入 req.user。
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { userId: string; jti: string; scope?: 'app' | 'admin'; role?: number; perms?: string[] } }>();
    const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    const payload = await this.tokenService.verifyActive(token);
    if (!payload || payload.typ !== 'access') {
      throw new BizException(BizCode.TOKEN_INVALID, '登录状态已失效，请重新登录', 401);
    }
    req.user = {
      userId: payload.sub,
      jti: payload.jti,
      scope: payload.scope ?? 'app',
      role: payload.role,
      perms: payload.perms,
    };
    return true;
  }
}