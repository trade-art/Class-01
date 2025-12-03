import { SetMetadata } from '@nestjs/common';

/**
 * 公开路由元数据键
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 公开路由装饰器
 * 标记的路由不需要 JWT 认证
 *
 * @example
 * ```ts
 * @Public()
 * @Post('login')
 * login() {
 *   return 'Public endpoint';
 * }
 * ```
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
