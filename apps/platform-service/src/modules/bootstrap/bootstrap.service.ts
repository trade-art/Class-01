import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { MiddlewareStatus } from '@prisma/client';
import {
  RegisterMiddlewareDto,
  RegisterMiddlewareResponseDto,
  BootstrapConfigResponseDto,
  BootstrapHeartbeatDto,
  BootstrapHeartbeatResponseDto,
  TenantBootstrapConfigDto,
  MtServerBootstrapConfigDto,
  RuntimeConfigDto,
} from './dto';

/**
 * 中间件引导服务
 * 处理中间件的首次注册和配置拉取
 */
@Injectable()
export class BootstrapService {
  private readonly logger = new Logger(BootstrapService.name);
  private readonly heartbeatInterval: number;
  private readonly configPollInterval: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
  ) {
    this.heartbeatInterval = this.configService.get<number>('MIDDLEWARE_HEARTBEAT_INTERVAL', 30);
    this.configPollInterval = this.configService.get<number>('MIDDLEWARE_CONFIG_POLL_INTERVAL', 60);
  }

  /**
   * 中间件注册
   * 通过唯一的 registrationSecret 识别中间件并返回 API Key
   */
  async register(dto: RegisterMiddlewareDto): Promise<RegisterMiddlewareResponseDto> {
    this.logger.log(`中间件注册请求`);

    // 1. 通过 registrationSecret 哈希查找中间件
    const registrationSecretHash = this.encryptionService.hash(dto.registrationSecret);

    const middleware = await this.prisma.middleware.findFirst({
      where: {
        registrationSecretHash,
      },
    });

    if (!middleware) {
      this.logger.warn(`注册密钥无效或中间件不存在`);
      throw new UnauthorizedException('注册密钥无效，请检查密钥是否正确或在平台管理后台创建中间件');
    }

    // 2. 生成新的 API Key (每次注册都重新生成，确保安全)
    const apiKey = this.encryptionService.generateApiKey('mw_');
    const apiKeyHash = this.encryptionService.hash(apiKey);

    // 3. 构建 URL (基于 serverIp 和 listenPort)
    let url = middleware.url;
    if (dto.serverIp) {
      const port = dto.listenPort || 8083;
      url = `http://${dto.serverIp}:${port}`;
    }

    // 4. 更新中间件状态
    await this.prisma.middleware.update({
      where: { id: middleware.id },
      data: {
        status: MiddlewareStatus.ONLINE,
        lastHeartbeat: new Date(),
        serverIp: dto.serverIp || middleware.serverIp,
        url,
        apiKey,
        apiKeyHash,
      },
    });

    this.logger.log(`中间件 ${middleware.name} (${middleware.id}) 注册成功`);

    return {
      success: true,
      middlewareId: middleware.id,
      middlewareName: middleware.name,
      apiKey,
      heartbeatInterval: this.heartbeatInterval,
      configPollInterval: this.configPollInterval,
    };
  }

  /**
   * 获取完整引导配置
   * 包含所有启动所需的配置信息
   */
  async getConfig(middlewareId: string, apiKey: string): Promise<BootstrapConfigResponseDto> {
    // 1. 验证 API Key
    const middleware = await this.validateApiKey(middlewareId, apiKey);

    // 2. 获取分配给该中间件的租户
    const assignments = await this.prisma.middlewareAssignment.findMany({
      where: { middlewareId: middleware.id },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    const tenantIds = assignments.map((a) => a.tenantId);

    // 3. 获取租户的 MT 服务器配置 (包含管理员账号)
    const mtServers = await this.prisma.mtServer.findMany({
      where: {
        tenantId: { in: tenantIds },
        isActive: true,
      },
      include: {
        managers: {
          where: { isActive: true },
          orderBy: { isDefault: 'desc' },
          take: 1, // 只取一个默认/活跃的管理员账号
        },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    // 4. 计算配置版本
    const configVersion = mtServers.length > 0
      ? Math.max(...mtServers.map((s) => s.configVersion))
      : 0;

    // 5. 按租户分组服务器
    const serversByTenant = new Map<string, typeof mtServers>();
    for (const server of mtServers) {
      if (!serversByTenant.has(server.tenantId)) {
        serversByTenant.set(server.tenantId, []);
      }
      serversByTenant.get(server.tenantId)!.push(server);
    }

    // 6. 构建租户配置
    const tenants: TenantBootstrapConfigDto[] = assignments.map((assignment) => {
      const tenantServers = serversByTenant.get(assignment.tenantId) || [];
      return {
        tenantId: assignment.tenant.id,
        tenantCode: assignment.tenant.code,
        tenantName: assignment.tenant.name,
        mtServers: tenantServers.map((server) => this.toMtServerConfig(server)),
      };
    });

    // 7. 获取基础设施配置
    const redisConfig = {
      host: this.configService.get<string>('MIDDLEWARE_REDIS_HOST', '127.0.0.1'),
      port: this.configService.get<number>('MIDDLEWARE_REDIS_PORT', 6379),
      password: this.configService.get<string>('MIDDLEWARE_REDIS_PASSWORD', ''),
      db: this.configService.get<number>('MIDDLEWARE_REDIS_DB', 0),
      poolSize: this.configService.get<number>('MIDDLEWARE_REDIS_POOL_SIZE', 10),
    };

    const databaseConfig = {
      host: this.configService.get<string>('MIDDLEWARE_DB_HOST', '127.0.0.1'),
      port: this.configService.get<number>('MIDDLEWARE_DB_PORT', 5432),
      dbname: this.configService.get<string>('MIDDLEWARE_DB_NAME', 'mt5_middleware'),
      user: this.configService.get<string>('MIDDLEWARE_DB_USER', 'postgres'),
      password: this.configService.get<string>('MIDDLEWARE_DB_PASSWORD', ''),
      connectionNumber: this.configService.get<number>('MIDDLEWARE_DB_POOL_SIZE', 10),
    };

    const jwtConfig = {
      secret: this.configService.get<string>('MIDDLEWARE_JWT_SECRET', 'change-me-in-production'),
      issuer: 'mt5-middleware',
      expireSeconds: this.configService.get<number>('MIDDLEWARE_JWT_EXPIRE', 7200),
      refreshExpireSeconds: this.configService.get<number>('MIDDLEWARE_JWT_REFRESH_EXPIRE', 604800),
    };

    const encryptionConfig = {
      masterKey: this.configService.get<string>('MIDDLEWARE_ENCRYPTION_KEY', ''),
      algorithm: 'AES-256-GCM',
    };

    const cacheConfig = {
      userTtl: this.configService.get<number>('MIDDLEWARE_CACHE_USER_TTL', 300),
      quoteTtl: this.configService.get<number>('MIDDLEWARE_CACHE_QUOTE_TTL', 1),
      balanceTtl: this.configService.get<number>('MIDDLEWARE_CACHE_BALANCE_TTL', 5),
      symbolTtl: this.configService.get<number>('MIDDLEWARE_CACHE_SYMBOL_TTL', 86400),
      barsTtl: this.configService.get<number>('MIDDLEWARE_CACHE_BARS_TTL', 60),
    };

    // 8. 获取运行时配置 (从数据库)
    const runtimeConfig = await this.getRuntimeConfig(middleware.id);

    this.logger.debug(
      `返回中间件 ${middleware.name} 引导配置: ${tenants.length} 个租户, ` +
      `${mtServers.length} 个服务器, 版本 ${configVersion}`,
    );

    return {
      middlewareId: middleware.id,
      middlewareName: middleware.name,
      configVersion,
      configUpdatedAt: new Date(),
      redis: redisConfig,
      database: databaseConfig,
      jwt: jwtConfig,
      encryption: encryptionConfig,
      cache: cacheConfig,
      runtime: runtimeConfig,
      tenants,
      heartbeatInterval: this.heartbeatInterval,
      configPollInterval: this.configPollInterval,
    };
  }

  /**
   * 处理心跳
   */
  async handleHeartbeat(
    middlewareId: string,
    apiKey: string,
    dto: BootstrapHeartbeatDto,
  ): Promise<BootstrapHeartbeatResponseDto> {
    // 1. 验证 API Key
    const middleware = await this.validateApiKey(middlewareId, apiKey);

    // 2. 映射状态
    let status: MiddlewareStatus = MiddlewareStatus.ONLINE;
    if (dto.status) {
      switch (dto.status.toLowerCase()) {
        case 'healthy':
          status = MiddlewareStatus.ONLINE;
          break;
        case 'degraded':
          status = MiddlewareStatus.DEGRADED;
          break;
        case 'unhealthy':
        case 'error':
          status = MiddlewareStatus.ERROR;
          break;
        default:
          status = MiddlewareStatus.UNKNOWN;
      }
    }

    // 3. 更新中间件状态
    await this.prisma.middleware.update({
      where: { id: middleware.id },
      data: {
        status,
        serverIp: dto.serverIp,
        activeSessions: dto.activeSessions,
        memoryUsagePercent: dto.memoryUsage,
        cpuUsage: dto.cpuUsage,
        lastHeartbeat: new Date(),
        cacheStatus: dto.redisConnected !== undefined ? { redisConnected: dto.redisConnected } : undefined,
      },
    });

    // 4. 检查配置是否有更新
    const latestVersion = await this.getLatestConfigVersion(middleware.id);
    const configUpdated = dto.currentConfigVersion !== undefined && latestVersion > dto.currentConfigVersion;

    this.logger.debug(
      `中间件 ${middleware.name} 心跳: status=${status}, ` +
      `sessions=${dto.activeSessions || 0}, configUpdated=${configUpdated}`,
    );

    return {
      success: true,
      serverTime: new Date(),
      nextHeartbeatInterval: this.heartbeatInterval,
      configUpdated,
      latestConfigVersion: latestVersion,
      requireConfigRefresh: configUpdated,
    };
  }

  /**
   * 验证 API Key
   */
  private async validateApiKey(middlewareId: string, apiKey: string) {
    if (!apiKey) {
      throw new UnauthorizedException('缺少 API Key');
    }

    const middleware = await this.prisma.middleware.findFirst({
      where: {
        OR: [
          { id: middlewareId },
          { name: middlewareId },
        ],
      },
    });

    if (!middleware) {
      throw new NotFoundException(`中间件 ${middlewareId} 不存在`);
    }

    // 验证 API Key (apiKeyHash 可能为空，表示中间件尚未注册)
    if (!middleware.apiKeyHash) {
      throw new UnauthorizedException('中间件尚未注册，请使用注册密钥先进行注册');
    }

    const apiKeyHash = this.encryptionService.hash(apiKey);
    if (!this.encryptionService.timingSafeEqual(apiKeyHash, middleware.apiKeyHash)) {
      throw new UnauthorizedException('API Key 验证失败');
    }

    return middleware;
  }

  /**
   * 获取最新配置版本号
   */
  private async getLatestConfigVersion(middlewareId: string): Promise<number> {
    const assignments = await this.prisma.middlewareAssignment.findMany({
      where: { middlewareId },
      select: { tenantId: true },
    });

    if (assignments.length === 0) {
      return 0;
    }

    const tenantIds = assignments.map((a) => a.tenantId);

    const result = await this.prisma.mtServer.aggregate({
      where: {
        tenantId: { in: tenantIds },
        isActive: true,
      },
      _max: {
        configVersion: true,
      },
    });

    return result._max.configVersion || 0;
  }

  /**
   * 转换为 MT 服务器配置
   * @param server MT 服务器 (包含 managers 关系)
   */
  private toMtServerConfig(server: {
    id: string;
    serverId: string;
    displayName: string | null;
    platformType: string;
    serverAddress: string;
    isActive: boolean;
    isDefault: boolean;
    managers: Array<{
      managerLogin: bigint;
      managerPasswordEncrypted: string;
    }>;
    // 允许 Prisma 返回的额外字段
    [key: string]: unknown;
  }): MtServerBootstrapConfigDto {
    // 获取默认/活跃的管理员账号
    const manager = server.managers[0];
    if (!manager) {
      this.logger.warn(`服务器 ${server.serverId} 没有配置管理员账号`);
      return {
        id: server.id,
        serverId: server.serverId,
        displayName: server.displayName ?? undefined,
        platformType: server.platformType,
        serverAddress: server.serverAddress,
        managerLogin: '',
        managerPassword: '',
        isActive: server.isActive,
        isDefault: server.isDefault,
      };
    }

    // 解密管理员密码
    let decryptedPassword = '';
    try {
      decryptedPassword = this.encryptionService.decrypt(manager.managerPasswordEncrypted);
    } catch (error) {
      this.logger.error(`解密服务器 ${server.serverId} 密码失败: ${error}`);
    }

    return {
      id: server.id,
      serverId: server.serverId,
      displayName: server.displayName ?? undefined,
      platformType: server.platformType,
      serverAddress: server.serverAddress,
      managerLogin: manager.managerLogin.toString(),
      managerPassword: decryptedPassword,
      isActive: server.isActive,
      isDefault: server.isDefault,
    };
  }

  /**
   * 获取运行时配置
   * 从数据库加载，如不存在则返回默认值
   */
  private async getRuntimeConfig(middlewareId: string): Promise<RuntimeConfigDto> {
    // 查找或使用默认配置
    let config = await this.prisma.middlewareConfig.findUnique({
      where: { middlewareId },
    });

    // 如果没有配置记录，创建默认配置
    if (!config) {
      config = await this.prisma.middlewareConfig.create({
        data: { middlewareId },
      });
      this.logger.log(`为中间件 ${middlewareId} 创建默认运行时配置`);
    }

    // 转换为 RuntimeConfigDto 结构
    return {
      rateLimit: {
        enabled: config.rateLimitEnabled,
        requestsPerMin: config.rateLimitRequestsPerMin,
        burstSize: config.rateLimitBurstSize,
      },
      circuitBreaker: {
        enabled: config.circuitBreakerEnabled,
        failureThreshold: config.circuitBreakerFailureThreshold,
        openTimeoutSec: config.circuitBreakerOpenTimeoutSec,
        halfOpenRequests: config.circuitBreakerHalfOpenRequests,
      },
      retry: {
        enabled: config.retryEnabled,
        maxRetries: config.retryMaxRetries,
        baseDelayMs: config.retryBaseDelayMs,
        maxDelayMs: config.retryMaxDelayMs,
      },
      cache: {
        userTtl: config.cacheUserTtl,
        quoteTtl: config.cacheQuoteTtl,
        balanceTtl: config.cacheBalanceTtl,
        symbolTtl: config.cacheSymbolTtl,
        barsTtl: config.cacheBarsTtl,
      },
      websocket: {
        heartbeatIntervalSec: config.wsHeartbeatIntervalSec,
        pingTimeoutSec: config.wsPingTimeoutSec,
        maxConnections: config.wsMaxConnections,
      },
      cors: {
        enabled: config.corsEnabled,
        allowedOrigins: config.corsAllowedOrigins,
        allowedMethods: config.corsAllowedMethods,
      },
      security: {
        maxLoginAttempts: config.securityMaxLoginAttempts,
        lockoutDurationMin: config.securityLockoutDurationMin,
        sessionTimeoutMin: config.securitySessionTimeoutMin,
      },
      requestQueue: {
        enabled: config.requestQueueEnabled,
        maxSize: config.requestQueueMaxSize,
        timeoutMs: config.requestQueueTimeoutMs,
        workerCount: config.requestQueueWorkerCount,
      },
      batchConcurrencyLimit: config.batchConcurrencyLimit,
    };
  }
}
