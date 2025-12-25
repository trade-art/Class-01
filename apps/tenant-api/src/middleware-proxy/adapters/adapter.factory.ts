import { Injectable, Logger, OnModuleDestroy, Inject, forwardRef, Optional } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { TradingPlatformAdapter } from './trading-platform.adapter';
import { MT5Adapter } from './mt5.adapter';
import { MT4Adapter } from './mt4.adapter';
import {
  PlatformType,
  AdapterConfig,
  MtServerConfig,
} from './types';
import {
  ServiceTokenService,
  GenerateTokenRequest,
  GeneratePoolModeTokenRequest,
} from '../../auth/services/service-token.service';

/**
 * 适配器实例缓存键
 */
interface AdapterCacheKey {
  tenantId: string;
  serverId: string;
}

/**
 * 缓存的适配器信息
 */
interface CachedAdapter {
  adapter: TradingPlatformAdapter;
  createdAt: Date;
  lastUsed: Date;
  config: MtServerConfig;
}

/**
 * 熔断器状态
 */
export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailure?: Date;
  lastSuccess?: Date;
}

/**
 * 适配器工厂
 * 负责创建和缓存不同平台的适配器实例
 */
@Injectable()
export class AdapterFactory implements OnModuleDestroy {
  private readonly logger = new Logger(AdapterFactory.name);
  private readonly adapters = new Map<string, CachedAdapter>();
  private readonly circuitBreakers = new Map<string, CircuitBreakerState>();

  // 适配器最大空闲时间 (30 分钟)
  private readonly maxIdleTime = 30 * 60 * 1000;

  // 清理间隔 (5 分钟)
  private readonly cleanupInterval = 5 * 60 * 1000;

  // 熔断器配置
  private readonly circuitBreakerThreshold = 5; // 失败阈值
  private readonly circuitBreakerTimeout = 60000; // 熔断超时时间 (1分钟)

  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly httpService: HttpService,
    @Optional()
    @Inject(forwardRef(() => ServiceTokenService))
    private readonly serviceTokenService?: ServiceTokenService,
  ) {
    // 启动定期清理
    this.startCleanupTimer();
  }

  /**
   * 获取或创建适配器实例
   * @param serverConfig MT 服务器配置
   * @returns 适配器实例
   */
  async getAdapter(serverConfig: MtServerConfig): Promise<TradingPlatformAdapter> {
    const cacheKey = this.getCacheKey(serverConfig.tenantId, serverConfig.serverId);

    // 检查缓存
    const cached = this.adapters.get(cacheKey);
    if (cached) {
      // 检查配置是否变化
      if (this.isConfigChanged(cached.config, serverConfig)) {
        this.logger.log(`配置变化，重新创建适配器: ${cacheKey}`);
        await this.removeAdapter(serverConfig.tenantId, serverConfig.serverId);
      } else {
        cached.lastUsed = new Date();
        return cached.adapter;
      }
    }

    // 创建新适配器
    const adapter = this.createAdapter(serverConfig);

    // 缓存适配器
    this.adapters.set(cacheKey, {
      adapter,
      createdAt: new Date(),
      lastUsed: new Date(),
      config: serverConfig,
    });

    this.logger.log(`创建新适配器: ${cacheKey} (${serverConfig.platformType})`);

    return adapter;
  }

  /**
   * 创建适配器实例
   *
   * 使用 ServiceToken 模式进行认证:
   * - 生成包含加密 Manager 凭证的 Service Token
   * - 将 Token 配置到 AdapterConfig 中
   * - 适配器构造函数自动初始化认证状态
   */
  private createAdapter(serverConfig: MtServerConfig): TradingPlatformAdapter {
    const adapterConfig: AdapterConfig = {
      baseUrl: serverConfig.middlewareUrl,
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    };

    // 如果 ServiceTokenService 可用，生成 ServiceToken 用于认证
    if (this.serviceTokenService) {
      try {
        let tokenResponse;

        // 优先使用 Pool Mode Token (当 managerId 存在时)
        // Pool Mode Token 使用连接池中的现有连接，避免创建新连接的问题
        if (serverConfig.managerId) {
          const poolModeRequest: GeneratePoolModeTokenRequest = {
            managerId: serverConfig.managerId,
            tenantId: serverConfig.tenantId,
            scopes: ['*'],
          };
          tokenResponse = this.serviceTokenService.generatePoolModeToken(poolModeRequest);
          this.logger.log(
            `为适配器生成 Pool Mode Token: tenantId=${serverConfig.tenantId}, managerId=${serverConfig.managerId}`,
          );
        } else {
          // 回退到 Traditional Token (当 managerId 不存在时)
          const tokenRequest: GenerateTokenRequest = {
            tenantId: serverConfig.tenantId,
            instanceId: `inst_${serverConfig.tenantId}_${serverConfig.serverId}`,
            serverId: serverConfig.serverId,
            managerLogin: serverConfig.managerLogin,
            managerPassword: serverConfig.managerPassword,
            scopes: ['*'],
          };
          tokenResponse = this.serviceTokenService.generateToken(tokenRequest);
          this.logger.warn(
            `managerId 不存在，使用 Traditional Token (可能无法使用连接池): tenantId=${serverConfig.tenantId}, serverId=${serverConfig.serverId}`,
          );
        }

        // 设置 ServiceToken 配置
        adapterConfig.serviceToken = {
          token: tokenResponse.token,
          tokenType: tokenResponse.tokenType,
          expiresAt: tokenResponse.expiresAt,
        };

        // 设置认证头 (包含完整的 Service Token)
        adapterConfig.authHeaders = {
          'Content-Type': 'application/json',
          Authorization: `${tokenResponse.tokenType} ${tokenResponse.token}`,
          'X-Tenant-Id': serverConfig.tenantId,
          'X-Server-Id': serverConfig.serverId,
          'X-Server-Address': serverConfig.serverAddress,
        };
      } catch (error) {
        this.logger.warn(
          `生成 ServiceToken 失败，适配器将无法认证: ${error}`,
        );
      }
    } else {
      this.logger.warn(
        'ServiceTokenService 不可用，适配器将无法使用 ServiceToken 认证',
      );
    }

    switch (serverConfig.platformType) {
      case PlatformType.MT5:
        return new MT5Adapter(this.httpService, adapterConfig);

      case PlatformType.MT4:
        return new MT4Adapter(this.httpService, adapterConfig);

      default:
        throw new Error(`Unsupported platform type: ${serverConfig.platformType}`);
    }
  }

  /**
   * 移除适配器
   */
  async removeAdapter(tenantId: string, serverId: string): Promise<boolean> {
    const cacheKey = this.getCacheKey(tenantId, serverId);
    const existed = this.adapters.has(cacheKey);

    if (existed) {
      this.adapters.delete(cacheKey);
      this.logger.log(`移除适配器: ${cacheKey}`);
    }

    return existed;
  }

  /**
   * 移除租户的所有适配器
   */
  async removeAdaptersByTenant(tenantId: string): Promise<number> {
    let count = 0;
    const keysToRemove: string[] = [];

    for (const [key, cached] of this.adapters) {
      if (cached.config.tenantId === tenantId) {
        keysToRemove.push(key);
        count++;
      }
    }

    for (const key of keysToRemove) {
      this.adapters.delete(key);
    }

    if (count > 0) {
      this.logger.log(`移除租户 ${tenantId} 的 ${count} 个适配器`);
    }

    return count;
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): {
    totalAdapters: number;
    byPlatform: Record<PlatformType, number>;
    byTenant: Record<string, number>;
  } {
    const stats = {
      totalAdapters: this.adapters.size,
      byPlatform: {} as Record<PlatformType, number>,
      byTenant: {} as Record<string, number>,
    };

    for (const cached of this.adapters.values()) {
      // 按平台统计
      const platform = cached.config.platformType;
      stats.byPlatform[platform] = (stats.byPlatform[platform] || 0) + 1;

      // 按租户统计
      const tenant = cached.config.tenantId;
      stats.byTenant[tenant] = (stats.byTenant[tenant] || 0) + 1;
    }

    return stats;
  }

  /**
   * 清理空闲适配器
   */
  cleanupIdleAdapters(): number {
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (const [key, cached] of this.adapters) {
      const idleTime = now - cached.lastUsed.getTime();
      if (idleTime > this.maxIdleTime) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      this.adapters.delete(key);
    }

    if (keysToRemove.length > 0) {
      this.logger.log(`清理 ${keysToRemove.length} 个空闲适配器`);
    }

    return keysToRemove.length;
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(tenantId: string, serverId: string): string {
    return `${tenantId}:${serverId}`;
  }

  /**
   * 检查配置是否变化
   */
  private isConfigChanged(
    oldConfig: MtServerConfig,
    newConfig: MtServerConfig,
  ): boolean {
    return (
      oldConfig.middlewareUrl !== newConfig.middlewareUrl ||
      oldConfig.platformType !== newConfig.platformType ||
      oldConfig.managerLogin !== newConfig.managerLogin
    );
  }

  /**
   * 启动定期清理
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleAdapters();
    }, this.cleanupInterval);
  }

  /**
   * 停止定期清理
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * NestJS 模块销毁时调用
   * 确保定时器和资源被正确清理
   */
  async onModuleDestroy(): Promise<void> {
    await this.destroy();
  }

  /**
   * 销毁工厂（清理所有资源）
   */
  async destroy(): Promise<void> {
    this.stopCleanupTimer();
    this.adapters.clear();
    this.circuitBreakers.clear();
    this.logger.log('适配器工厂已销毁');
  }

  // ============================================================
  // 熔断器管理
  // ============================================================

  /**
   * 获取熔断器状态
   */
  getCircuitBreakerStatus(
    tenantId: string,
    serverId: string,
  ): CircuitBreakerState | null {
    const cacheKey = this.getCacheKey(tenantId, serverId);
    return this.circuitBreakers.get(cacheKey) || null;
  }

  /**
   * 重置熔断器
   */
  resetCircuitBreaker(tenantId: string, serverId: string): void {
    const cacheKey = this.getCacheKey(tenantId, serverId);
    this.circuitBreakers.set(cacheKey, {
      state: 'closed',
      failureCount: 0,
      lastSuccess: new Date(),
    });
    this.logger.log(`重置熔断器: ${cacheKey}`);
  }

  /**
   * 记录成功调用
   */
  recordSuccess(tenantId: string, serverId: string): void {
    const cacheKey = this.getCacheKey(tenantId, serverId);
    const current = this.circuitBreakers.get(cacheKey);

    this.circuitBreakers.set(cacheKey, {
      state: 'closed',
      failureCount: 0,
      lastFailure: current?.lastFailure,
      lastSuccess: new Date(),
    });
  }

  /**
   * 记录失败调用
   */
  recordFailure(tenantId: string, serverId: string): void {
    const cacheKey = this.getCacheKey(tenantId, serverId);
    const current = this.circuitBreakers.get(cacheKey) || {
      state: 'closed' as const,
      failureCount: 0,
    };

    const newFailureCount = current.failureCount + 1;
    const newState =
      newFailureCount >= this.circuitBreakerThreshold ? 'open' : current.state;

    this.circuitBreakers.set(cacheKey, {
      state: newState,
      failureCount: newFailureCount,
      lastFailure: new Date(),
      lastSuccess: current.lastSuccess,
    });

    if (newState === 'open' && current.state !== 'open') {
      this.logger.warn(`熔断器打开: ${cacheKey} (失败次数: ${newFailureCount})`);
    }
  }

  /**
   * 检查熔断器是否允许调用
   */
  isCircuitBreakerOpen(tenantId: string, serverId: string): boolean {
    const cacheKey = this.getCacheKey(tenantId, serverId);
    const state = this.circuitBreakers.get(cacheKey);

    if (!state || state.state === 'closed') {
      return false;
    }

    if (state.state === 'open' && state.lastFailure) {
      // 检查是否超过熔断超时时间，进入半开状态
      const elapsed = Date.now() - state.lastFailure.getTime();
      if (elapsed >= this.circuitBreakerTimeout) {
        this.circuitBreakers.set(cacheKey, {
          ...state,
          state: 'half-open',
        });
        return false;
      }
    }

    return state.state === 'open';
  }

  /**
   * 获取所有熔断器状态
   */
  getAllCircuitBreakerStatus(): Map<string, CircuitBreakerState> {
    return new Map(this.circuitBreakers);
  }
}
