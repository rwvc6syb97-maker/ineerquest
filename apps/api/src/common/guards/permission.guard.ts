import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { BizCode, BizException } from '../response';
import { hasPermission } from '../../modules/ops/admin-rbac.constants';

/** 声明接口所需权限点（RBAC），如 @RequirePerms('ops:audit') */
export const PERMS_KEY = 'requiredPerms';
export const RequirePerms = (...perms: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMS_KEY, perms);

/** req.user 在后台鉴权后携带的作用域/角色/权限点视图 */
interface AdminUserView {
  userId: string;
  jti: string;
  scope?: 'app' | 'admin';
  role?: number;
  perms?: string[];
}

/**
 * 第 3 层 · Permission 守卫（RBAC 真实比对，T4-10）。
 *
 * 落地要点：
 *  1. 接口未声明 @RequirePerms → 直接放行（非后台受限接口）。
 *  2. 声明了权限点 → 必须为 scope=admin 的 token，否则 403（C 端 token 越权）。
 *  3. 从 req.user.perms 与所需权限点比对，支持 `*` 全通配与 `xxx:*` 前缀通配。
 *  4. 权限不足 → 抛 403（ADMIN_PERMISSION_DENIED）。
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AdminUserView }>();
    const user = req.user;

    // 受限后台接口必须由 scope=admin 的 token 访问
    if (!user || user.scope !== 'admin') {
      throw new BizException(
        BizCode.ADMIN_SCOPE_INVALID,
        '无权访问运营后台，请使用后台账号登录',
        403,
      );
    }

    if (!hasPermission(user.perms, required)) {
      throw new BizException(
        BizCode.ADMIN_PERMISSION_DENIED,
        '权限不足，无法执行该操作',
        403,
      );
    }
    return true;
  }
}