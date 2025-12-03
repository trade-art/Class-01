import { Injectable, CanActivate, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserType } from '../dto/login.dto';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const USER_TYPES_KEY = 'userTypes';
export const UserTypes = (...userTypes: UserType[]) => SetMetadata(USER_TYPES_KEY, userTypes);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Check user types first
    const requiredUserTypes = this.reflector.getAllAndOverride<UserType[]>(USER_TYPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      return false;
    }

    if (requiredUserTypes && requiredUserTypes.length > 0) {
      if (!requiredUserTypes.includes(user.userType)) {
        return false;
      }
    }

    // Check roles
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    return requiredRoles.some((role) => user.role === role);
  }
}
