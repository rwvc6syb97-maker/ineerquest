import {
  hasPermission,
  canLoginAdmin,
  resolvePermsByUserRole,
  AdminRole,
} from './admin-rbac.constants';

/** T4-10 RBAC 权限点通配匹配单测 */
describe('admin-rbac hasPermission (T4-10)', () => {
  it('required 为空 → 恒放行', () => {
    expect(hasPermission([], [])).toBe(true);
    expect(hasPermission(undefined, [])).toBe(true);
  });

  it('全通配 * 命中任意权限点', () => {
    expect(hasPermission(['*'], ['user:ban', 'question:write'], 'all')).toBe(true);
  });

  it('精确相等命中', () => {
    expect(hasPermission(['user:read'], ['user:read'])).toBe(true);
    expect(hasPermission(['user:read'], ['user:ban'])).toBe(false);
  });

  it('前缀通配 ns:* 命中同命名空间', () => {
    expect(hasPermission(['question:*'], ['question:write'])).toBe(true);
    expect(hasPermission(['question:*'], ['career:write'])).toBe(false);
  });

  it('any 模式满足任一即可，all 模式需全部满足', () => {
    expect(hasPermission(['user:read'], ['user:read', 'user:ban'], 'any')).toBe(true);
    expect(hasPermission(['user:read'], ['user:read', 'user:ban'], 'all')).toBe(false);
  });

  it('空权限集合 → 全部越权', () => {
    expect(hasPermission([], ['user:read'])).toBe(false);
  });
});

describe('admin-rbac 角色解析 (T4-10)', () => {
  it('仅 role=3 允许登录后台', () => {
    expect(canLoginAdmin(3)).toBe(true);
    expect(canLoginAdmin(1)).toBe(false);
    expect(canLoginAdmin(2)).toBe(false);
  });

  it('role=3 兜底映射为超级管理员(*)', () => {
    const perms = resolvePermsByUserRole(3);
    expect(perms).toEqual(['*']);
    expect(AdminRole.SUPER_ADMIN).toBe('super_admin');
  });
});