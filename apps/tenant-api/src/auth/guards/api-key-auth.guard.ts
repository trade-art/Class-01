import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RateLimiterService } from '../../security/rate-limiter.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  ApiKeyTokenPayload,
  ApiKeyFullContext,
  buildContextFromApiKey,
} from '../interfaces/request-context.interface';
import * as jwt from 'jsonwebtoken';

/**
 * API Key Token 认证守卫
 *
 * 专门处理第三方应用通过 API Key 获取的 Access Token。
 * 与 JwtAuthGuard 不同，此 Guard 验证的是 API Key Token 格式。
 *
 * 使用场景:
 * - 第三方应用通过 /mt-managers/api-key/authenticate 获取 Access Token
 * - 使用该 Token 调用业务 API (如交易、持仓查询等)
 *
 * Token 特征:
 * - 包含 type: 'access'
 * - 包含 managerId, managerLogin, apiKeyId
 * - 不包含 email, role (与 Console Token 的区别)
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyAuthGuard.name);
  private readonly jwtSecret: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly rateLimiterService: RateLimiterService,
  ) {
    // 使用与 MtManagerApiKeyService 相同的密钥配置路径
    this.jwtSecret =
      this.configService.get<string>('managerApiKey.jwtSecret') ||
      this.configService.get<string>('jwt.secret') ||
      'manager-api-key-secret';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 检查是否是公开路由
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // 提取 Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('缺少认证令牌');
    }

    // 验证 Bearer 格式
    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('无效的认证格式');
    }

    // 验证并解析 Token (精简版 Token)
    const payload = await this.validateToken(token);

    // 验证 Manager 状态并获取完整上下文信息
    const fullContext = await this.validateManagerAndGetContext(payload);

    // 检查 API Key 速率限制
    await this.checkRateLimit(payload.apiKeyId);

    // 构建统一的请求上下文
    const requestContext = buildContextFromApiKey(fullContext);

    // 将 payload 和 context 附加到 request
    request.user = fullContext; // 保持兼容性 (使用完整上下文)
    request.apiKeyPayload = fullContext; // API Key 专用 (使用完整上下文)
    request.requestContext = requestContext; // 统一上下文

    this.logger.debug(
      `API Key 认证成功: managerLogin=${fullContext.managerLogin}, tenant=${fullContext.tenantId}`,
    );

    return true;
  }

  /**
   * 检查 API Key 速率限制
   */
  private async checkRateLimit(apiKeyId: string): Promise<void> {
    // MtManager API Key (以 mk_ 开头) 使用默认速率限制
    if (apiKeyId.startsWith('mk_')) {
      const defaultRateLimit = 1000; // 默认 1000/分钟
      const rateLimitResult = await this.rateLimiterService.checkApiKeyLimit(
        apiKeyId,
        defaultRateLimit,
      );

      if (!rateLimitResult.allowed) {
        const retryAfterSeconds = Math.max(
          0,
          Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
        );

        this.logger.warn(
          `MtManager API Key ${apiKeyId} 超出速率限制 (${defaultRateLimit}/分钟)`,
        );

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `速率限制超出，请在 ${retryAfterSeconds} 秒后重试`,
            error: 'Too Many Requests',
            errorCode: 'RATE_LIMITED',
            retryAfter: retryAfterSeconds,
            limit: defaultRateLimit,
            remaining: 0,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return;
    }

    // 通用 API Key，获取速率限制配置
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { id: apiKeyId },
      select: { id: true, rateLimit: true },
    });

    if (!apiKey) {
      // API Key 不存在，跳过速率限制检查（应该在其他验证中已处理）
      return;
    }

    // 检查速率限制
    const rateLimitResult = await this.rateLimiterService.checkApiKeyLimit(
      apiKey.id,
      apiKey.rateLimit,
    );

    if (!rateLimitResult.allowed) {
      const retryAfterSeconds = Math.max(
        0,
        Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
      );

      this.logger.warn(
        `API Key ${apiKey.id} 超出速率限制 (${apiKey.rateLimit}/分钟)`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `速率限制超出，请在 ${retryAfterSeconds} 秒后重试`,
          error: 'Too Many Requests',
          errorCode: 'RATE_LIMITED',
          retryAfter: retryAfterSeconds,
          limit: apiKey.rateLimit,
          remaining: 0,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * 验证 JWT Token
   */
  private async validateToken(token: string): Promise<ApiKeyTokenPayload> {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as ApiKeyTokenPayload;

      // 检查是否是 API Key Token (必须包含 type 字段)
      if (!payload.type) {
        throw new UnauthorizedException('无效的 Token 类型');
      }

      // 检查是否是 Access Token
      if (payload.type !== 'access') {
        throw new UnauthorizedException('请使用 Access Token，而非 Refresh Token');
      }

      // 验证必要字段
      if (!payload.managerId || !payload.tenantId || !payload.apiKeyId) {
        throw new UnauthorizedException('Token 缺少必要信息');
      }

      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('Access Token 已过期，请使用 Refresh Token 刷新');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedException('无效的 Token');
      }
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Token 验证失败: ${error}`);
      throw new UnauthorizedException('Token 验证失败');
    }
  }

  /**
   * 验证 Manager 状态并获取完整上下文信息
   *
   * 精简版 Token 只包含 managerId, tenantId, apiKeyId
   * 此方法从数据库查询完整信息，包括:
   * - serverId, managerLogin, platformType
   * - middlewareId, middlewareUrl
   */
  private async validateManagerAndGetContext(
    payload: ApiKeyTokenPayload,
  ): Promise<ApiKeyFullContext> {
    const manager = await this.prisma.mtManager.findFirst({
      where: {
        id: payload.managerId,
        apiKeyId: payload.apiKeyId,
      },
      select: {
        id: true,
        isActive: true,
        apiKeyEnabled: true,
        tenantId: true,
        managerLogin: true,
        server: {
          select: {
            serverId: true,
            platformType: true,
            middlewareId: true,
            middlewareUrl: true,
          },
        },
      },
    });

    if (!manager) {
      throw new UnauthorizedException('经理账号不存在或 API Key 已被撤销');
    }

    if (!manager.isActive) {
      throw new UnauthorizedException('经理账号已被禁用');
    }

    if (!manager.apiKeyEnabled) {
      throw new UnauthorizedException('API Key 已被禁用');
    }

    // 验证租户 ID 一致性
    if (manager.tenantId !== payload.tenantId) {
      this.logger.warn(
        `租户 ID 不匹配: token=${payload.tenantId}, db=${manager.tenantId}`,
      );
      throw new UnauthorizedException('Token 无效');
    }

    // 检查服务器配置
    if (!manager.server) {
      throw new UnauthorizedException('关联的 MT 服务器不存在');
    }

    // 构建完整上下文
    return {
      type: payload.type,
      managerId: payload.managerId,
      tenantId: payload.tenantId,
      apiKeyId: payload.apiKeyId,
      serverId: manager.server.serverId,
      managerLogin: manager.managerLogin.toString(),
      middlewareId: manager.server.middlewareId || undefined,
      middlewareUrl: manager.server.middlewareUrl || undefined,
      platformType: manager.server.platformType,
      iat: payload.iat,
      exp: payload.exp,
    };
  }
}
