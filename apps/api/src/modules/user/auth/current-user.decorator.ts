import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface CurrentUserPayload {
  userId: string;
  jti: string;
  /** token 作用域：'app' C 端 / 'admin' 运营后台（T4-10） */
  scope?: 'app' | 'admin';
  /** 顶层角色位（user.role） */
  role?: number;
  /** 后台权限点集合（RBAC） */
  perms?: string[];
}

/**
 * @CurrentUser() — 从 req.user 读取当前登录用户（由 AuthGuard 注入）。
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: CurrentUserPayload }>();
    return req.user;
  },
);