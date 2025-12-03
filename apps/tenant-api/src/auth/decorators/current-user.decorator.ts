import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * JWT Payload 接口
 */
export interface JwtPayload {
  /** 管理员 ID */
  sub: string;
  /** 邮箱 */
  email: string;
  /** 角色 */
  role: 'owner' | 'admin' | 'operator';
  /** 租户 ID */
  tenantId: string;
  /** 实例 ID */
  instanceId: string;
  /** Token 签发时间 */
  iat?: number;
  /** Token 过期时间 */
  exp?: number;
}

/**
 * 获取当前登录用户信息装饰器
 *
 * @example
 * ```ts
 * @Get('profile')
 * getProfile(@CurrentUser() user: JwtPayload) {
 *   return user;
 * }
 *
 * @Get('email')
 * getEmail(@CurrentUser('email') email: string) {
 *   return email;
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
