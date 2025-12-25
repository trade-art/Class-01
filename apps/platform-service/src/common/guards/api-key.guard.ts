import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../services/encryption.service';

/**
 * 中间件 API Key 请求扩展
 */
export interface MiddlewareRequest extends Request {
  middleware: {
    id: string;
    name: string;
    url: string;
  };
}

/**
 * API Key 认证守卫
 * 用于验证中间件服务到平台服务的内部 API 调用
 *
 * 使用方式:
 * 1. 在 Controller 上使用 @UseGuards(ApiKeyGuard)
 * 2. 请求头需要包含 X-Middleware-API-Key: <api_key>
 * 3. 验证成功后，middleware 信息会附加到 request 对象
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private readonly API_KEY_HEADER = 'x-middleware-api-key';

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<MiddlewareRequest>();
    const apiKey = request.headers[this.API_KEY_HEADER] as string;

    if (!apiKey) {
      this.logger.warn('API Key 请求头缺失');
      throw new UnauthorizedException('缺少 API Key 认证头');
    }

    // 计算 API Key 的哈希值
    const apiKeyHash = this.encryptionService.hash(apiKey);

    // 查询中间件
    const middleware = await this.prisma.middleware.findFirst({
      where: { apiKeyHash },
      select: {
        id: true,
        name: true,
        url: true,
      },
    });

    if (!middleware) {
      this.logger.warn(`无效的 API Key: ${apiKey.substring(0, 10)}...`);
      throw new UnauthorizedException('无效的 API Key');
    }

    // 将中间件信息附加到请求对象
    request.middleware = middleware;

    this.logger.debug(`API Key 验证成功: ${middleware.name} (${middleware.id})`);

    return true;
  }
}
