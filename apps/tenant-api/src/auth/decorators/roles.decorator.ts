import { SetMetadata } from '@nestjs/common';

/**
 * 角色类型
 */
export type Role = 'owner' | 'admin' | 'operator';

/**
 * 角色元数据键
 */
export const ROLES_KEY = 'roles';

/**
 * 角色装饰器
 * 用于定义接口需要的角色权限
 *
 * @example
 * ```ts
 * @Roles('owner', 'admin')
 * @Get('admin-only')
 * adminOnly() {
 *   return 'Only for admins';
 * }
 * ```
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * 角色层级 (用于判断权限继承)
 * owner > admin > operator
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 3,
  admin: 2,
  operator: 1,
};

/**
 * 检查角色是否有足够权限
 */
export function hasRolePermission(
  userRole: Role,
  requiredRoles: Role[],
): boolean {
  const userLevel = ROLE_HIERARCHY[userRole];
  return requiredRoles.some((role) => userLevel >= ROLE_HIERARCHY[role]);
}
