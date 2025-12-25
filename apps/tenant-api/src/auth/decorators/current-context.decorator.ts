import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestContext } from '../interfaces/request-context.interface';

/**
 * 获取统一请求上下文装饰器
 *
 * 支持两种认证方式:
 * - Console 管理员登录 (JwtAuthGuard)
 * - API Key 第三方应用 (ApiKeyAuthGuard)
 *
 * 业务服务可以通过此装饰器获取统一的上下文信息，无需关心请求来源。
 *
 * @example
 * ```ts
 * // 获取完整上下文
 * @Get('data')
 * getData(@CurrentContext() ctx: RequestContext) {
 *   console.log(ctx.tenantId, ctx.serverId);
 *   if (ctx.authType === AuthType.API_KEY) {
 *     console.log('来自 API Key 认证:', ctx.managerLogin);
 *   }
 * }
 *
 * // 获取特定字段
 * @Get('tenant')
 * getTenantId(@CurrentContext('tenantId') tenantId: string) {
 *   return tenantId;
 * }
 * ```
 */
export const CurrentContext = createParamDecorator(
  (data: keyof RequestContext | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const requestContext = request.requestContext as RequestContext;

    if (!requestContext) {
      return null;
    }

    return data ? requestContext[data] : requestContext;
  },
);

/**
 * 获取 API Key Payload 装饰器
 *
 * 仅用于 API Key 认证的路由，获取原始的 API Key Token Payload。
 *
 * @example
 * ```ts
 * @UseGuards(ApiKeyAuthGuard)
 * @Get('api-info')
 * getApiInfo(@CurrentApiKey() payload: ApiKeyTokenPayload) {
 *   return {
 *     managerId: payload.managerId,
 *     managerLogin: payload.managerLogin,
 *   };
 * }
 * ```
 */
export const CurrentApiKey = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const apiKeyPayload = request.apiKeyPayload;

    if (!apiKeyPayload) {
      return null;
    }

    return data ? apiKeyPayload[data] : apiKeyPayload;
  },
);
