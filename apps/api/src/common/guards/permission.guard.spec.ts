import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';
import { BizCode, BizException } from '../response';

/**
 * T4-10 PermissionGuard 单测：
 *  - 无 @RequirePerms → 放行
 *  - 声明权限但非 admin token → ADMIN_SCOPE_INVALID(403)
 *  - admin token 且权限命中（精确/前缀通配/全通配）→ 放行
 *  - admin token 但权限不足 → ADMIN_PERMISSION_DENIED(403)
 */
describe('PermissionGuard (T4-10 RBAC)', () => {
  const makeReflector = (required?: string[]): Reflector =>
    ({ getAllAndOverride: () => required } as unknown as Reflector);

  const makeCtx = (user?: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext);

  it('未声明 @RequirePerms 时直接放行', () => {
    const guard = new PermissionGuard(makeReflector(undefined));
    expect(guard.canActivate(makeCtx({ scope: 'admin', perms: [] }))).toBe(true);
  });

  it('声明权限但缺少 user → ADMIN_SCOPE_INVALID', () => {
    const guard = new PermissionGuard(makeReflector(['question:write']));
    try {
      guard.canActivate(makeCtx(undefined));
      fail('应抛出 BizException');
    } catch (e) {
      expect(e).toBeInstanceOf(BizException);
      expect((e as BizException).bizCode).toBe(BizCode.ADMIN_SCOPE_INVALID);
    }
  });

  it('声明权限但为 C 端 token(scope=app) → ADMIN_SCOPE_INVALID', () => {
    const guard = new PermissionGuard(makeReflector(['question:write']));
    try {
      guard.canActivate(makeCtx({ scope: 'app', perms: ['question:write'] }));
      fail('应抛出 BizException');
    } catch (e) {
      expect((e as BizException).bizCode).toBe(BizCode.ADMIN_SCOPE_INVALID);
    }
  });

  it('admin token 精确命中权限点 → 放行', () => {
    const guard = new PermissionGuard(makeReflector(['user:ban']));
    const ctx = makeCtx({ scope: 'admin', perms: ['user:read', 'user:ban'] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('admin token 前缀通配命中(question:*) → 放行', () => {
    const guard = new PermissionGuard(makeReflector(['question:write']));
    const ctx = makeCtx({ scope: 'admin', perms: ['question:*'] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('admin token 全通配(*) → 放行', () => {
    const guard = new PermissionGuard(makeReflector(['anything:delete']));
    const ctx = makeCtx({ scope: 'admin', perms: ['*'] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('admin token 但权限不足 → ADMIN_PERMISSION_DENIED', () => {
    const guard = new PermissionGuard(makeReflector(['user:ban']));
    const ctx = makeCtx({ scope: 'admin', perms: ['analytics:read'] });
    try {
      guard.canActivate(ctx);
      fail('应抛出 BizException');
    } catch (e) {
      expect((e as BizException).bizCode).toBe(BizCode.ADMIN_PERMISSION_DENIED);
    }
  });
});