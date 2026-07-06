/**
 * T4-10 运营后台 RBAC「角色 → 权限点」映射常量。
 *
 * 依据《后端设计文档.md》§1.2 RBAC 权限模型：
 * - 复用 user.role（1普通/2辅导师/3管理员）作为顶层角色位；
 * - 后台内部按「后台角色 AdminRole」细分权限点 permission；
 * - 通过 User.admin_role（VARCHAR）字段持久化后台角色；
 * - 支持超级管理员 `*`通配、`question:*` 前缀通配。
 *
 * 默认兜底：若 admin_role 为空则按 USER_ROLE_TO_ADMIN_ROLE 映射（role=3 → super_admin）。
 */

/** 顶层角色位（对齐 schema user.role，TINYINT） */
export const UserRole = {
  NORMAL: 1,
  COACH: 2,
  ADMIN: 3,
} as const;

/** 后台细分角色标识（配置化，非 DB 枚举） */
export const AdminRole = {
  /** 超级管理员：全通配 */
  SUPER_ADMIN: 'super_admin',
  /** 内容运营 */
  CONTENT_OPS: 'content_ops',
  /** 用户运营 */
  USER_OPS: 'user_ops',
  /** 辅导师运营 */
  COACH_OPS: 'coach_ops',
  /** 数据分析 */
  ANALYST: 'analyst',
} as const;

export type AdminRoleKey = (typeof AdminRole)[keyof typeof AdminRole];

/**
 * 后台角色 → 权限点集合映射。
 * 通配约定：
 *  - `*`         匹配任意权限点（超级管理员）
 *  - `question:*` 匹配 `question:` 前缀下的任意权限点（如 question:write）
 */
export const ADMIN_ROLE_PERMISSIONS: Record<string, string[]> = {
  [AdminRole.SUPER_ADMIN]: ['*'],
  [AdminRole.CONTENT_OPS]: ['question:*', 'career:*', 'resource:*', 'topic:review', 'payment:manage', 'membership:plan:manage'],
  [AdminRole.USER_OPS]: ['user:read', 'user:ban'],
  [AdminRole.COACH_OPS]: ['coach:audit', 'coach:shelf', 'review:manage'],
  [AdminRole.ANALYST]: ['analytics:read'],
};

/**
 * 顶层 user.role → 默认后台角色映射（兜底）。
 * 仅当 User.adminRole 为空时生效；role=3 → super_admin。
 */
export const USER_ROLE_TO_ADMIN_ROLE:Record<number, AdminRoleKey> = {
  [UserRole.ADMIN]: AdminRole.SUPER_ADMIN,
};

/**
 * 由 User 记录解析最终后台角色。
 * 优先取 adminRole（DB 持久化字段），为空时回退到 USER_ROLE_TO_ADMIN_ROLE 映射。
 */
export function resolveAdminRole(user: { role: number; adminRole?: string | null }): AdminRoleKey | undefined {
  if (user.adminRole && Object.values(AdminRole).includes(user.adminRole as AdminRoleKey)) {
    return user.adminRole as AdminRoleKey;
  }
  return USER_ROLE_TO_ADMIN_ROLE[user.role];
}

/** 判断该顶层角色是否允许登录后台（当前仅 role=3 管理员）。 */
export function canLoginAdmin(role: number): boolean {
  return role === UserRole.ADMIN;
}

/**
 * 展开某后台角色拥有的权限点集合（登录时写入 token.perms）。
 * 未知角色返回空数组（无任何权限，等价于全部越权）。
 */
export function resolvePermsByAdminRole(adminRole: string | undefined): string[] {
  if (!adminRole) return [];
  return ADMIN_ROLE_PERMISSIONS[adminRole] ?? [];
}

/**
 * 由顶层 user.role 解析后台权限点集合（兜底路径）。
 */
export function resolvePermsByUserRole(role: number): string[] {
  const adminRole = USER_ROLE_TO_ADMIN_ROLE[role];
  return resolvePermsByAdminRole(adminRole);
}

/**
 * 权限点匹配核心：判断持有的权限集合 owned 是否满足 required 中的任一/全部。
 *
 * 单个 required 命中规则：
 *  1. owned 含 `*`             → 命中（超级管理员）
 *  2. owned 含精确相等项        → 命中
 *  3. owned 含前缀通配 `x:*` 且 required 以 `x:` 开头 → 命中
 *
 * @param owned    持有的权限点集合（来自 token.perms）
 * @param required 接口声明所需的权限点集合（@RequirePerms）
 * @param mode     'any'（默认，满足任一即可）| 'all'（需全部满足）
 */
export function hasPermission(
  owned: string[] | undefined,
  required: string[],
  mode: 'any' | 'all' = 'any',
): boolean {
  if (!required || required.length === 0) return true;
  const set = owned ?? [];
  if (set.includes('*')) return true;

  const matchOne = (need: string): boolean => {
    if (set.includes(need)) return true;
    // 前缀通配：owned 中存在 `ns:*` 且 need 属于该命名空间
    return set.some((p) => {
      if (!p.endsWith(':*')) return false;
      const ns = p.slice(0, -1); // 'question:*' -> 'question:'
      return need.startsWith(ns);
    });
  };

  return mode === 'all' ? required.every(matchOne) : required.some(matchOne);
}