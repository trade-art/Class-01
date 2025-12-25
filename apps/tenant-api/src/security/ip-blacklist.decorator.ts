/**
 * IP 黑名单相关装饰器
 */

import { SetMetadata } from '@nestjs/common';
import { SKIP_IP_BLACKLIST_KEY } from './ip-blacklist.guard';

/**
 * 跳过 IP 黑名单检查
 * 用于健康检查、公开 API 等不需要 IP 检查的端点
 *
 * @example
 * ```typescript
 * @Get('health')
 * @SkipIpBlacklist()
 * healthCheck() {
 *   return { status: 'ok' };
 * }
 * ```
 */
export const SkipIpBlacklist = () => SetMetadata(SKIP_IP_BLACKLIST_KEY, true);
