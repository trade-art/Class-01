/**
 * 限流守卫
 * 在请求处理前检查限流状态
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import {
  RateLimiterService,
  RATE_LIMIT_STRATEGIES,
  RateLimitConfig,
  RateLimitResult,
} from './rate-limiter.service';
import { RATE_LIMIT_KEY, RateLimitOptions } from './rate-limit.decorator';

/**
 * 限流响应头
 */
const RATE_LIMIT_HEADERS = {
  LIMIT: 'X-RateLimit-Limit',
  REMAINING: 'X-RateLimit-Remaining',
  RESET: 'X-RateLimit-Reset',
  RETRY_AFTER: 'Retry-After',
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly defaultStrategy = 'general';

  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimiterService: RateLimiterService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // 获取装饰器配置
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 如果标记跳过限流
    if (options?.skip) {
      return true;
    }

    // 获取限流配置
    const config = this.resolveConfig(options);
    const key = this.generateKey(request, options);

    // 检查限流
    const result = await this.rateLimiterService.checkLimit(key, config);

    // 添加限流响应头
    this.addRateLimitHeaders(response, result);

    // 如果被限流
    if (!result.allowed) {
      this.logger.warn(
        `Rate limit exceeded: ${key} - ${result.current}/${result.limit}`,
      );

      const errorMessage =
        options?.errorMessage ||
        `请求过于频繁，请在 ${result.retryAfter} 秒后重试`;

      throw new HttpException(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: errorMessage,
            retryAfter: result.retryAfter,
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  /**
   * 解析限流配置
   */
  private resolveConfig(options?: RateLimitOptions): RateLimitConfig {
    // 优先使用自定义配置
    if (options?.config) {
      return {
        name: options.config.name || 'custom',
        windowSizeSeconds: options.config.windowSizeSeconds || 60,
        maxRequests: options.config.maxRequests || 100,
        perUser: options.config.perUser,
        perTenant: options.config.perTenant,
      };
    }

    // 使用预定义策略
    const strategyName = options?.strategy || this.defaultStrategy;
    const strategy = RATE_LIMIT_STRATEGIES[strategyName];

    if (!strategy) {
      this.logger.warn(`Unknown rate limit strategy: ${strategyName}, using default`);
      return RATE_LIMIT_STRATEGIES[this.defaultStrategy];
    }

    return strategy;
  }

  /**
   * 生成限流键
   */
  private generateKey(request: Request, options?: RateLimitOptions): string {
    const keyGenerator = options?.keyGenerator || 'ip';
    const user = (request as any).user;

    switch (keyGenerator) {
      case 'user':
        if (user?.sub) {
          return this.rateLimiterService.generateKey({
            userId: user.sub,
            endpoint: this.getEndpointKey(request),
          });
        }
        // 如果没有用户信息，回退到 IP
        return this.rateLimiterService.generateKey({
          ip: this.getClientIp(request),
          endpoint: this.getEndpointKey(request),
        });

      case 'tenant':
        if (user?.tenantId) {
          return this.rateLimiterService.generateKey({
            tenantId: user.tenantId,
            endpoint: this.getEndpointKey(request),
          });
        }
        // 如果没有租户信息，回退到 IP
        return this.rateLimiterService.generateKey({
          ip: this.getClientIp(request),
          endpoint: this.getEndpointKey(request),
        });

      case 'composite':
        return this.rateLimiterService.generateKey({
          ip: this.getClientIp(request),
          userId: user?.sub,
          tenantId: user?.tenantId,
          endpoint: this.getEndpointKey(request),
        });

      case 'ip':
      default:
        return this.rateLimiterService.generateKey({
          ip: this.getClientIp(request),
          endpoint: this.getEndpointKey(request),
        });
    }
  }

  /**
   * 获取客户端 IP
   */
  private getClientIp(request: Request): string {
    // 优先使用 X-Forwarded-For (反向代理场景)
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return ips.trim();
    }

    // 其次使用 X-Real-IP
    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    // 最后使用连接 IP
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }

  /**
   * 获取端点键
   */
  private getEndpointKey(request: Request): string {
    return `${request.method}:${request.route?.path || request.path}`;
  }

  /**
   * 添加限流响应头
   */
  private addRateLimitHeaders(response: Response, result: RateLimitResult): void {
    response.setHeader(RATE_LIMIT_HEADERS.LIMIT, result.limit.toString());
    response.setHeader(RATE_LIMIT_HEADERS.REMAINING, result.remaining.toString());
    response.setHeader(RATE_LIMIT_HEADERS.RESET, result.resetAt.toString());

    if (!result.allowed) {
      response.setHeader(RATE_LIMIT_HEADERS.RETRY_AFTER, result.retryAfter.toString());
    }
  }
}
