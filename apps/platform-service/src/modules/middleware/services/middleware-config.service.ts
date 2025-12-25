import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MiddlewareConfigDto, UpdateMiddlewareConfigDto } from '../dto';

/**
 * 中间件运行时配置服务
 * 管理中间件的运行时参数（速率限制、熔断器、缓存等）
 */
@Injectable()
export class MiddlewareRuntimeConfigService {
  private readonly logger = new Logger(MiddlewareRuntimeConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取中间件配置
   * 如果配置不存在则创建默认配置
   */
  async getConfig(middlewareId: string): Promise<MiddlewareConfigDto> {
    // 验证中间件存在
    const middleware = await this.prisma.middleware.findUnique({
      where: { id: middlewareId },
    });

    if (!middleware) {
      throw new NotFoundException(`中间件 ${middlewareId} 不存在`);
    }

    // 查找或创建配置
    let config = await this.prisma.middlewareConfig.findUnique({
      where: { middlewareId },
    });

    if (!config) {
      // 创建默认配置
      config = await this.prisma.middlewareConfig.create({
        data: { middlewareId },
      });
      this.logger.log(`为中间件 ${middleware.name} 创建默认配置`);
    }

    return this.toDto(config);
  }

  /**
   * 更新中间件配置
   */
  async updateConfig(
    middlewareId: string,
    dto: UpdateMiddlewareConfigDto,
  ): Promise<MiddlewareConfigDto> {
    // 验证中间件存在
    const middleware = await this.prisma.middleware.findUnique({
      where: { id: middlewareId },
    });

    if (!middleware) {
      throw new NotFoundException(`中间件 ${middlewareId} 不存在`);
    }

    // 查找或创建配置
    let config = await this.prisma.middlewareConfig.findUnique({
      where: { middlewareId },
    });

    if (!config) {
      // 创建配置
      config = await this.prisma.middlewareConfig.create({
        data: {
          middlewareId,
          ...this.dtoToData(dto),
        },
      });
    } else {
      // 更新配置
      config = await this.prisma.middlewareConfig.update({
        where: { middlewareId },
        data: this.dtoToData(dto),
      });
    }

    this.logger.log(`更新中间件 ${middleware.name} 配置`);

    return this.toDto(config);
  }

  /**
   * 重置中间件配置为默认值
   */
  async resetConfig(middlewareId: string): Promise<MiddlewareConfigDto> {
    // 验证中间件存在
    const middleware = await this.prisma.middleware.findUnique({
      where: { id: middlewareId },
    });

    if (!middleware) {
      throw new NotFoundException(`中间件 ${middlewareId} 不存在`);
    }

    // 删除现有配置
    await this.prisma.middlewareConfig.deleteMany({
      where: { middlewareId },
    });

    // 创建默认配置
    const config = await this.prisma.middlewareConfig.create({
      data: { middlewareId },
    });

    this.logger.log(`重置中间件 ${middleware.name} 配置为默认值`);

    return this.toDto(config);
  }

  /**
   * 转换 DTO 到数据库更新数据
   */
  private dtoToData(dto: UpdateMiddlewareConfigDto): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    // Rate Limit
    if (dto.rateLimitEnabled !== undefined) data.rateLimitEnabled = dto.rateLimitEnabled;
    if (dto.rateLimitRequestsPerMin !== undefined) data.rateLimitRequestsPerMin = dto.rateLimitRequestsPerMin;
    if (dto.rateLimitBurstSize !== undefined) data.rateLimitBurstSize = dto.rateLimitBurstSize;

    // Circuit Breaker
    if (dto.circuitBreakerEnabled !== undefined) data.circuitBreakerEnabled = dto.circuitBreakerEnabled;
    if (dto.circuitBreakerFailureThreshold !== undefined) data.circuitBreakerFailureThreshold = dto.circuitBreakerFailureThreshold;
    if (dto.circuitBreakerOpenTimeoutSec !== undefined) data.circuitBreakerOpenTimeoutSec = dto.circuitBreakerOpenTimeoutSec;
    if (dto.circuitBreakerHalfOpenRequests !== undefined) data.circuitBreakerHalfOpenRequests = dto.circuitBreakerHalfOpenRequests;

    // Retry
    if (dto.retryEnabled !== undefined) data.retryEnabled = dto.retryEnabled;
    if (dto.retryMaxRetries !== undefined) data.retryMaxRetries = dto.retryMaxRetries;
    if (dto.retryBaseDelayMs !== undefined) data.retryBaseDelayMs = dto.retryBaseDelayMs;
    if (dto.retryMaxDelayMs !== undefined) data.retryMaxDelayMs = dto.retryMaxDelayMs;

    // Cache TTL
    if (dto.cacheUserTtl !== undefined) data.cacheUserTtl = dto.cacheUserTtl;
    if (dto.cacheQuoteTtl !== undefined) data.cacheQuoteTtl = dto.cacheQuoteTtl;
    if (dto.cacheBalanceTtl !== undefined) data.cacheBalanceTtl = dto.cacheBalanceTtl;
    if (dto.cacheSymbolTtl !== undefined) data.cacheSymbolTtl = dto.cacheSymbolTtl;
    if (dto.cacheBarsTtl !== undefined) data.cacheBarsTtl = dto.cacheBarsTtl;

    // WebSocket
    if (dto.wsHeartbeatIntervalSec !== undefined) data.wsHeartbeatIntervalSec = dto.wsHeartbeatIntervalSec;
    if (dto.wsPingTimeoutSec !== undefined) data.wsPingTimeoutSec = dto.wsPingTimeoutSec;
    if (dto.wsMaxConnections !== undefined) data.wsMaxConnections = dto.wsMaxConnections;

    // CORS
    if (dto.corsEnabled !== undefined) data.corsEnabled = dto.corsEnabled;
    if (dto.corsAllowedOrigins !== undefined) data.corsAllowedOrigins = dto.corsAllowedOrigins;
    if (dto.corsAllowedMethods !== undefined) data.corsAllowedMethods = dto.corsAllowedMethods;

    // Security
    if (dto.securityMaxLoginAttempts !== undefined) data.securityMaxLoginAttempts = dto.securityMaxLoginAttempts;
    if (dto.securityLockoutDurationMin !== undefined) data.securityLockoutDurationMin = dto.securityLockoutDurationMin;
    if (dto.securitySessionTimeoutMin !== undefined) data.securitySessionTimeoutMin = dto.securitySessionTimeoutMin;

    // Request Queue
    if (dto.requestQueueEnabled !== undefined) data.requestQueueEnabled = dto.requestQueueEnabled;
    if (dto.requestQueueMaxSize !== undefined) data.requestQueueMaxSize = dto.requestQueueMaxSize;
    if (dto.requestQueueTimeoutMs !== undefined) data.requestQueueTimeoutMs = dto.requestQueueTimeoutMs;
    if (dto.requestQueueWorkerCount !== undefined) data.requestQueueWorkerCount = dto.requestQueueWorkerCount;

    // Batch
    if (dto.batchConcurrencyLimit !== undefined) data.batchConcurrencyLimit = dto.batchConcurrencyLimit;

    return data;
  }

  /**
   * 转换为 DTO
   */
  private toDto(config: {
    id: string;
    middlewareId: string;
    rateLimitEnabled: boolean;
    rateLimitRequestsPerMin: number;
    rateLimitBurstSize: number;
    circuitBreakerEnabled: boolean;
    circuitBreakerFailureThreshold: number;
    circuitBreakerOpenTimeoutSec: number;
    circuitBreakerHalfOpenRequests: number;
    retryEnabled: boolean;
    retryMaxRetries: number;
    retryBaseDelayMs: number;
    retryMaxDelayMs: number;
    cacheUserTtl: number;
    cacheQuoteTtl: number;
    cacheBalanceTtl: number;
    cacheSymbolTtl: number;
    cacheBarsTtl: number;
    wsHeartbeatIntervalSec: number;
    wsPingTimeoutSec: number;
    wsMaxConnections: number;
    corsEnabled: boolean;
    corsAllowedOrigins: string;
    corsAllowedMethods: string;
    securityMaxLoginAttempts: number;
    securityLockoutDurationMin: number;
    securitySessionTimeoutMin: number;
    requestQueueEnabled: boolean;
    requestQueueMaxSize: number;
    requestQueueTimeoutMs: number;
    requestQueueWorkerCount: number;
    batchConcurrencyLimit: number;
    createdAt: Date;
    updatedAt: Date;
  }): MiddlewareConfigDto {
    return {
      id: config.id,
      middlewareId: config.middlewareId,
      rateLimitEnabled: config.rateLimitEnabled,
      rateLimitRequestsPerMin: config.rateLimitRequestsPerMin,
      rateLimitBurstSize: config.rateLimitBurstSize,
      circuitBreakerEnabled: config.circuitBreakerEnabled,
      circuitBreakerFailureThreshold: config.circuitBreakerFailureThreshold,
      circuitBreakerOpenTimeoutSec: config.circuitBreakerOpenTimeoutSec,
      circuitBreakerHalfOpenRequests: config.circuitBreakerHalfOpenRequests,
      retryEnabled: config.retryEnabled,
      retryMaxRetries: config.retryMaxRetries,
      retryBaseDelayMs: config.retryBaseDelayMs,
      retryMaxDelayMs: config.retryMaxDelayMs,
      cacheUserTtl: config.cacheUserTtl,
      cacheQuoteTtl: config.cacheQuoteTtl,
      cacheBalanceTtl: config.cacheBalanceTtl,
      cacheSymbolTtl: config.cacheSymbolTtl,
      cacheBarsTtl: config.cacheBarsTtl,
      wsHeartbeatIntervalSec: config.wsHeartbeatIntervalSec,
      wsPingTimeoutSec: config.wsPingTimeoutSec,
      wsMaxConnections: config.wsMaxConnections,
      corsEnabled: config.corsEnabled,
      corsAllowedOrigins: config.corsAllowedOrigins,
      corsAllowedMethods: config.corsAllowedMethods,
      securityMaxLoginAttempts: config.securityMaxLoginAttempts,
      securityLockoutDurationMin: config.securityLockoutDurationMin,
      securitySessionTimeoutMin: config.securitySessionTimeoutMin,
      requestQueueEnabled: config.requestQueueEnabled,
      requestQueueMaxSize: config.requestQueueMaxSize,
      requestQueueTimeoutMs: config.requestQueueTimeoutMs,
      requestQueueWorkerCount: config.requestQueueWorkerCount,
      batchConcurrencyLimit: config.batchConcurrencyLimit,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }
}
