/**
 * API Key Token 认证 Guard
 *
 * 用于验证外部应用的 Access Token (由 API Key + Secret 认证获取)
 * 与常规 JWT Guard 不同，这个 Guard 专门处理外部 API Key Token
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { MtManagerApiKeyService, ApiKeyTokenPayload } from '../../mt-manager';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';

/**
 * 扩展 Request 接口，添加 apiKeyPayload 属性
 */
export interface ApiKeyAuthenticatedRequest extends Request {
  apiKeyPayload: ApiKeyTokenPayload;
}

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyAuthGuard.name);

  constructor(
    private readonly apiKeyService: MtManagerApiKeyService,
    private readonly reflector: Reflector,
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

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('缺少 Access Token');
    }

    try {
      // 验证 Token
      const payload = this.apiKeyService.validateAccessToken(token);

      // 将 payload 附加到请求对象
      (request as ApiKeyAuthenticatedRequest).apiKeyPayload = payload;

      return true;
    } catch (error) {
      this.logger.debug(`API Key Token 验证失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new UnauthorizedException(
        error instanceof Error ? error.message : 'Token 验证失败',
      );
    }
  }

  /**
   * 从 Authorization header 提取 token
   */
  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return undefined;
    }

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
