import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdapterFactory } from '../middleware-proxy/adapters/adapter.factory';
import { MtServerService } from '../middleware-proxy/services/mt-server.service';
import { PlatformType, ServerStatus } from '../middleware-proxy/adapters/types';

/**
 * 单个服务器健康状态
 */
export interface ServerHealthStatus {
  serverId: string;
  displayName: string | null;
  platformType: PlatformType;
  middlewareUrl: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  online: boolean;
  responseTime?: number;
  serverTime?: Date;
  version?: string;
  connectedUsers?: number;
  activePositions?: number;
  errorMessage?: string;
  lastChecked: Date;
}

/**
 * 租户健康状态
 */
export interface TenantHealthStatus {
  tenantId: string;
  tenantName: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  servers: ServerHealthStatus[];
  healthyCount: number;
  unhealthyCount: number;
  lastChecked: Date;
}

/**
 * 系统整体健康状态
 */
export interface SystemHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  totalTenants: number;
  totalServers: number;
  healthyServers: number;
  unhealthyServers: number;
  tenants?: TenantHealthStatus[];
}

/**
 * 熔断器状态
 */
export interface CircuitBreakerStatus {
  tenantId: string;
  serverId: string;
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailure?: Date;
  lastSuccess?: Date;
}

/**
 * 健康聚合服务
 * 聚合所有中间件的健康状态
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startTime = Date.now();

  // 健康状态缓存
  private healthCache = new Map<string, ServerHealthStatus>();
  private readonly cacheTimeout = 30000; // 30秒缓存

  constructor(
    private readonly prisma: PrismaService,
    private readonly mtServerService: MtServerService,
    private readonly adapterFactory: AdapterFactory,
  ) {}

  // ============================================================
  // 系统级健康检查
  // ============================================================

  /**
   * 获取系统整体健康状态
   * @param includeDetails 是否包含租户详情
   */
  async getSystemHealth(includeDetails = false): Promise<SystemHealthStatus> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
    });

    const servers = await this.prisma.mtServer.findMany({
      where: { isActive: true },
    });

    let healthyCount = 0;
    let unhealthyCount = 0;
    const tenantHealthList: TenantHealthStatus[] = [];

    // 并发检查所有租户的健康状态
    const checkPromises = tenants.map(async (tenant) => {
      try {
        const tenantHealth = await this.getTenantHealth(tenant.id);
        healthyCount += tenantHealth.healthyCount;
        unhealthyCount += tenantHealth.unhealthyCount;
        return tenantHealth;
      } catch (error) {
        this.logger.warn(`检查租户 ${tenant.id} 健康状态失败`, error);
        return {
          tenantId: tenant.id,
          tenantName: tenant.name,
          status: 'unhealthy' as const,
          servers: [],
          healthyCount: 0,
          unhealthyCount: 0,
          lastChecked: new Date(),
        };
      }
    });

    const results = await Promise.all(checkPromises);
    tenantHealthList.push(...results);

    // 计算整体状态
    let systemStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (unhealthyCount === 0) {
      systemStatus = 'healthy';
    } else if (healthyCount > 0) {
      systemStatus = 'degraded';
    } else {
      systemStatus = 'unhealthy';
    }

    return {
      status: systemStatus,
      timestamp: new Date(),
      uptime: Date.now() - this.startTime,
      totalTenants: tenants.length,
      totalServers: servers.length,
      healthyServers: healthyCount,
      unhealthyServers: unhealthyCount,
      tenants: includeDetails ? tenantHealthList : undefined,
    };
  }

  /**
   * 简单健康检查（用于 K8s liveness probe）
   */
  async isHealthy(): Promise<boolean> {
    try {
      // 检查数据库连接
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 就绪检查（用于 K8s readiness probe）
   */
  async isReady(): Promise<boolean> {
    try {
      // 检查数据库连接
      await this.prisma.$queryRaw`SELECT 1`;

      // 检查至少有一个健康的服务器
      const health = await this.getSystemHealth();
      return health.healthyServers > 0 || health.totalServers === 0;
    } catch {
      return false;
    }
  }

  // ============================================================
  // 租户级健康检查
  // ============================================================

  /**
   * 获取租户的健康状态
   */
  async getTenantHealth(tenantId: string): Promise<TenantHealthStatus> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });

    if (!tenant) {
      throw new Error(`租户 ${tenantId} 不存在`);
    }

    const { servers } = await this.mtServerService.getServers(tenantId);
    const activeServers = servers.filter((s) => s.isActive);

    // 并发检查所有服务器
    const serverHealthList = await Promise.all(
      activeServers.map((server) =>
        this.checkServerHealth(tenantId, server.serverId),
      ),
    );

    const healthyCount = serverHealthList.filter(
      (s) => s.status === 'healthy',
    ).length;
    const unhealthyCount = serverHealthList.filter(
      (s) => s.status === 'unhealthy',
    ).length;

    let tenantStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (unhealthyCount === 0 && serverHealthList.length > 0) {
      tenantStatus = 'healthy';
    } else if (healthyCount > 0) {
      tenantStatus = 'degraded';
    } else {
      tenantStatus = 'unhealthy';
    }

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      status: tenantStatus,
      servers: serverHealthList,
      healthyCount,
      unhealthyCount,
      lastChecked: new Date(),
    };
  }

  // ============================================================
  // 服务器级健康检查
  // ============================================================

  /**
   * 检查单个服务器健康状态
   */
  async checkServerHealth(
    tenantId: string,
    serverId: string,
  ): Promise<ServerHealthStatus> {
    const cacheKey = `${tenantId}:${serverId}`;
    const cached = this.healthCache.get(cacheKey);

    // 检查缓存是否有效
    if (cached && Date.now() - cached.lastChecked.getTime() < this.cacheTimeout) {
      return cached;
    }

    const server = await this.mtServerService.getServer(tenantId, serverId);
    const startTime = Date.now();

    try {
      const serverConfig = await this.mtServerService.getServerConfig(
        tenantId,
        serverId,
      );
      const adapter = await this.adapterFactory.getAdapter(serverConfig);

      // 测试连接并获取状态
      const [isConnected, serverStatus] = await Promise.all([
        adapter.testConnection().catch(() => false),
        adapter.getServerStatus().catch(() => null),
      ]);

      const responseTime = Date.now() - startTime;

      const healthStatus: ServerHealthStatus = {
        serverId: server.serverId,
        displayName: server.displayName,
        platformType: server.platformType,
        middlewareUrl: server.middlewareUrl,
        status: this.determineHealthStatus(isConnected, responseTime),
        online: isConnected,
        responseTime,
        serverTime: serverStatus?.serverTime,
        version: serverStatus?.version,
        connectedUsers: serverStatus?.connectedUsers,
        activePositions: serverStatus?.activePositions,
        lastChecked: new Date(),
      };

      // 更新缓存
      this.healthCache.set(cacheKey, healthStatus);

      return healthStatus;
    } catch (error) {
      const healthStatus: ServerHealthStatus = {
        serverId: server.serverId,
        displayName: server.displayName,
        platformType: server.platformType,
        middlewareUrl: server.middlewareUrl,
        status: 'unhealthy',
        online: false,
        responseTime: Date.now() - startTime,
        errorMessage:
          error instanceof Error ? error.message : 'Unknown error',
        lastChecked: new Date(),
      };

      // 更新缓存
      this.healthCache.set(cacheKey, healthStatus);

      return healthStatus;
    }
  }

  /**
   * 获取所有服务器的健康状态
   */
  async getAllServersHealth(): Promise<ServerHealthStatus[]> {
    const servers = await this.prisma.mtServer.findMany({
      where: { isActive: true },
      select: { tenantId: true, serverId: true },
    });

    const healthList = await Promise.all(
      servers.map((s) => this.checkServerHealth(s.tenantId, s.serverId)),
    );

    return healthList;
  }

  // ============================================================
  // 熔断器管理
  // ============================================================

  /**
   * 获取熔断器状态
   * 注意：实际的熔断器状态需要从适配器工厂获取
   */
  async getCircuitBreakerStatus(
    tenantId: string,
    serverId: string,
  ): Promise<CircuitBreakerStatus> {
    // 从适配器工厂获取熔断器状态
    const status = this.adapterFactory.getCircuitBreakerStatus(
      tenantId,
      serverId,
    );

    return {
      tenantId,
      serverId,
      state: status?.state || 'closed',
      failureCount: status?.failureCount || 0,
      lastFailure: status?.lastFailure,
      lastSuccess: status?.lastSuccess,
    };
  }

  /**
   * 重置熔断器
   */
  async resetCircuitBreaker(
    tenantId: string,
    serverId: string,
  ): Promise<boolean> {
    try {
      this.adapterFactory.resetCircuitBreaker(tenantId, serverId);

      // 清除健康缓存
      const cacheKey = `${tenantId}:${serverId}`;
      this.healthCache.delete(cacheKey);

      this.logger.log(
        `已重置熔断器: tenantId=${tenantId}, serverId=${serverId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `重置熔断器失败: tenantId=${tenantId}, serverId=${serverId}`,
        error,
      );
      return false;
    }
  }

  /**
   * 获取所有熔断器状态
   */
  async getAllCircuitBreakerStatus(): Promise<CircuitBreakerStatus[]> {
    const servers = await this.prisma.mtServer.findMany({
      where: { isActive: true },
      select: { tenantId: true, serverId: true },
    });

    return servers.map((s) => {
      const status = this.adapterFactory.getCircuitBreakerStatus(
        s.tenantId,
        s.serverId,
      );
      return {
        tenantId: s.tenantId,
        serverId: s.serverId,
        state: status?.state || 'closed',
        failureCount: status?.failureCount || 0,
        lastFailure: status?.lastFailure,
        lastSuccess: status?.lastSuccess,
      };
    });
  }

  // ============================================================
  // 私有辅助方法
  // ============================================================

  /**
   * 根据连接状态和响应时间确定健康状态
   */
  private determineHealthStatus(
    isConnected: boolean,
    responseTime: number,
  ): 'healthy' | 'degraded' | 'unhealthy' {
    if (!isConnected) {
      return 'unhealthy';
    }

    // 响应时间超过 5 秒视为降级
    if (responseTime > 5000) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * 清除健康缓存
   */
  clearHealthCache(): void {
    this.healthCache.clear();
    this.logger.log('已清除健康状态缓存');
  }
}
