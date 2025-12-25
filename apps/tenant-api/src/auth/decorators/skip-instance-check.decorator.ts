import { SetMetadata } from '@nestjs/common';

/**
 * 跳过实例检查元数据键
 */
export const SKIP_INSTANCE_CHECK_KEY = 'skipInstanceCheck';

/**
 * 跳过实例检查装饰器
 * 标记的路由不需要检查中间件实例状态
 * 适用于租户级别的数据接口（如订阅状态、配额信息等）
 *
 * @example
 * ```ts
 * @SkipInstanceCheck()
 * @Get('subscription')
 * getSubscription() {
 *   return 'Tenant-level data, no instance required';
 * }
 * ```
 */
export const SkipInstanceCheck = () => SetMetadata(SKIP_INSTANCE_CHECK_KEY, true);
