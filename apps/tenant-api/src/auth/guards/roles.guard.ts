import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  Role,
  ROLES_KEY,
  hasRolePermission,
} from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload } from '../decorators/current-user.decorator';
import { BusinessException, ErrorCodes } from '../../common';

/**
 * 角色权限守卫
 * 验证用户是否有访问资源的角色权限
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 检查是否是公开路由
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // 获取需要的角色
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 如果没有设置角色要求，则允许访问
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // 获取当前用户
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (!user) {
      throw BusinessException.unauthorized(ErrorCodes.AUTH_401_002);
    }

    // 检查角色权限 (支持层级继承)
    if (!hasRolePermission(user.role, requiredRoles)) {
      throw BusinessException.forbidden(
        ErrorCodes.AUTH_403_002,
        `需要 ${requiredRoles.join(' 或 ')} 角色权限`,
      );
    }

    return true;
  }
}
