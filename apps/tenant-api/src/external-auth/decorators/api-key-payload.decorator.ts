/**
 * API Key Payload 装饰器
 *
 * 用于从请求中获取 API Key Token 的 payload
 * 需要与 ApiKeyAuthGuard 配合使用
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiKeyTokenPayload } from '../../mt-manager';

/**
 * 获取 API Key Payload 装饰器
 *
 * @example
 * ```typescript
 * @Get('accounts')
 * @UseGuards(ApiKeyAuthGuard)
 * async getAccounts(@ApiKeyPayload() payload: ApiKeyTokenPayload) {
 *   // payload 包含: managerId, tenantId, serverId, managerLogin, platformType 等
 * }
 *
 * // 获取特定属性
 * @Get('accounts')
 * @UseGuards(ApiKeyAuthGuard)
 * async getAccounts(@ApiKeyPayload('tenantId') tenantId: string) {
 *   // 直接获取 tenantId
 * }
 * ```
 */
export const ApiKeyPayload = createParamDecorator(
  (data: keyof ApiKeyTokenPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const payload = request.apiKeyPayload as ApiKeyTokenPayload | undefined;

    if (!payload) {
      return undefined;
    }

    return data ? payload[data] : payload;
  },
);
