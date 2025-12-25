import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { REQUIRED_SCOPES_KEY } from '../decorators/require-scopes.decorator';
import { ApiKeyFullContext } from '../interfaces/request-context.interface';

/**
 * 作用域权限守卫
 *
 * 验证 API Key 是否有访问资源的作用域权限。
 * 仅用于 API Key 认证的请求 (由 ApiKeyAuthGuard 处理的请求)。
 *
 * 使用方式:
 * 1. 在 Controller 或方法上使用 @RequireScopes() 装饰器声明需要的作用域
 * 2. 在 Controller 上使用 @UseGuards(ApiKeyAuthGuard, ScopesGuard)
 *
 * @example
 * @UseGuards(ApiKeyAuthGuard, ScopesGuard)
 * @RequireScopes('trading:read')
 * @Get('positions')
 * getPositions() {}
 */
@Injectable()
export class ScopesGuard implements CanActivate {
  private readonly logger = new Logger(ScopesGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 检查是否是公开路由
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // 获取需要的作用域
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 如果没有设置作用域要求，则允许访问
    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    // 获取请求上下文
    const request = context.switchToHttp().getRequest();
    const apiKeyPayload = request.apiKeyPayload as ApiKeyFullContext | undefined;

    // 如果不是 API Key 认证的请求，则跳过作用域检查
    // (Console 管理员有完整权限)
    if (!apiKeyPayload?.apiKeyId) {
      return true;
    }

    // 根据 API Key 前缀获取作用域
    const scopes = await this.getScopesForApiKey(apiKeyPayload.apiKeyId);

    if (!scopes) {
      this.logger.warn(`API Key ${apiKeyPayload.apiKeyId} 不存在或已被禁用`);
      throw new ForbiddenException('API Key 无效或已被禁用');
    }

    // 检查作用域权限
    const hasPermission = this.checkScopesAllowed(requiredScopes, scopes);

    if (!hasPermission) {
      this.logger.warn(
        `API Key ${apiKeyPayload.apiKeyId} 作用域不足: 需要 [${requiredScopes.join(', ')}], 拥有 [${scopes.join(', ')}]`,
      );
      throw new ForbiddenException({
        statusCode: 403,
        message: '作用域权限不足',
        error: 'Forbidden',
        errorCode: 'SCOPE_DENIED',
        requiredScopes,
        currentScopes: scopes,
      });
    }

    return true;
  }

  /**
   * 根据 API Key ID 获取作用域
   * 支持两种 API Key 类型:
   * - mk_ 前缀: MT Manager API Key (从 mt_managers 表)
   * - 其他: 通用 API Key (从 api_keys 表)
   */
  private async getScopesForApiKey(apiKeyId: string): Promise<string[] | null> {
    // MT Manager API Key (mk_ 前缀)
    if (apiKeyId.startsWith('mk_')) {
      const manager = await this.prisma.mtManager.findFirst({
        where: { apiKeyId },
        select: { apiKeyScopes: true, apiKeyEnabled: true, isActive: true },
      });

      if (!manager || !manager.apiKeyEnabled || !manager.isActive) {
        return null;
      }

      return manager.apiKeyScopes || ['*'];
    }

    // 通用 API Key
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { id: apiKeyId },
      select: { scopes: true, isActive: true, revokedAt: true },
    });

    if (!apiKey || !apiKey.isActive || apiKey.revokedAt) {
      return null;
    }

    return apiKey.scopes;
  }

  /**
   * 检查作用域是否满足要求
   *
   * @param requiredScopes 需要的作用域列表
   * @param keyScopes API Key 拥有的作用域列表
   * @returns 是否满足要求
   */
  private checkScopesAllowed(
    requiredScopes: string[],
    keyScopes: string[],
  ): boolean {
    // 通配符作用域 - 拥有所有权限
    if (keyScopes.includes('*')) {
      return true;
    }

    // 检查每个必需作用域
    for (const required of requiredScopes) {
      const hasScope = keyScopes.some((scope) => {
        // 精确匹配
        if (scope === required) {
          return true;
        }

        // 前缀匹配 (如 trading:* 匹配 trading:read)
        if (scope.endsWith(':*')) {
          const prefix = scope.slice(0, -1); // 移除末尾的 *
          if (required.startsWith(prefix)) {
            return true;
          }
        }

        // 写权限包含读权限 (如 trading:write 包含 trading:read)
        if (scope.endsWith(':write') && required.endsWith(':read')) {
          const scopePrefix = scope.replace(':write', '');
          const requiredPrefix = required.replace(':read', '');
          if (scopePrefix === requiredPrefix) {
            return true;
          }
        }

        return false;
      });

      if (!hasScope) {
        return false;
      }
    }

    return true;
  }
}
