import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MiddlewareClientService } from './middleware-client.service';
import { HealthCheckerService } from './health-checker.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import {
  MiddlewareInstanceInfo,
  InstanceStatus,
  HealthSummary,
} from '../interfaces/middleware-health.interface';
import { MIDDLEWARE_API_PATHS, CACHE_TTL } from '../constants/middleware.constants';

/**
 * 账户余额信息
 */
export interface AccountBalance {
  login: number;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  currency: string;
}

/**
 * 持仓信息
 */
export interface Position {
  ticket: number;
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  openPrice: number;
  currentPrice: number;
  profit: number;
  swap: number;
  openTime: string;
}

/**
 * 订单历史
 */
export interface OrderHistory {
  ticket: number;
  symbol: string;
  type: string;
  volume: number;
  openPrice: number;
  closePrice: number;
  profit: number;
  openTime: string;
  closeTime: string;
}

/**
 * 聚合的交易数据
 */
export interface AggregatedTradingData {
  totalAccounts: number;
  totalBalance: number;
  totalEquity: number;
  totalProfit: number;
  activePositions: number;
  byCurrency: Record<string, {
    count: number;
    balance: number;
    equity: number;
  }>;
  lastUpdated: Date;
}

/**
 * 实例数据响应
 */
interface InstanceDataResponse<T> {
  instanceId: string;
  instanceName: string;
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 数据聚合服务
 * 跨中间件实例聚合交易数据
 * middleware-integration Task 9
 */
@Injectable()
export class DataAggregatorService {
  private readonly logger = new Logger(DataAggregatorService.name);

  // 内存缓存 (生产环境应使用 Redis)
  private cache = new Map<string, { data: any; expiresAt: Date }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly middlewareClient: MiddlewareClientService,
    private readonly healthChecker: HealthCheckerService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  /**
   * 获取平台级别的交易数据聚合
   */
  async getPlatformTradingData(): Promise<AggregatedTradingData> {
    const cacheKey = 'platform:trading';
    const cached = this.getFromCache<AggregatedTradingData>(cacheKey);
    if (cached) {
      return cached;
    }

    const instances = await this.getOnlineInstances();
    const results = await this.fetchFromAllInstances<AccountBalance[]>(
      instances,
      MIDDLEWARE_API_PATHS.TRADING_BALANCES,
    );

    const aggregated = this.aggregateBalances(results);
    this.setCache(cacheKey, aggregated, CACHE_TTL.PLATFORM_OVERVIEW);

    return aggregated;
  }

  /**
   * 获取租户级别的交易数据聚合
   */
  async getTenantTradingData(tenantId: string): Promise<AggregatedTradingData> {
    const cacheKey = `tenant:trading:${tenantId}`;
    const cached = this.getFromCache<AggregatedTradingData>(cacheKey);
    if (cached) {
      return cached;
    }

    const instances = await this.getOnlineInstances(tenantId);
    const results = await this.fetchFromAllInstances<AccountBalance[]>(
      instances,
      MIDDLEWARE_API_PATHS.TRADING_BALANCES,
    );

    const aggregated = this.aggregateBalances(results);
    this.setCache(cacheKey, aggregated, CACHE_TTL.TENANT_OVERVIEW);

    return aggregated;
  }

  /**
   * 获取所有持仓 (跨实例)
   */
  async getAllPositions(tenantId?: string): Promise<{
    total: number;
    positions: Array<Position & { instanceId: string; instanceName: string }>;
  }> {
    const instances = await this.getOnlineInstances(tenantId);
    const results = await this.fetchFromAllInstances<Position[]>(
      instances,
      MIDDLEWARE_API_PATHS.TRADING_POSITIONS,
    );

    const positions: Array<Position & { instanceId: string; instanceName: string }> = [];

    results.forEach(result => {
      if (result.success && result.data) {
        result.data.forEach(pos => {
          positions.push({
            ...pos,
            instanceId: result.instanceId,
            instanceName: result.instanceName,
          });
        });
      }
    });

    return {
      total: positions.length,
      positions: positions.sort((a, b) => b.profit - a.profit),
    };
  }

  /**
   * 获取订单历史 (跨实例)
   */
  async getOrderHistory(
    options: {
      tenantId?: string;
      startDate?: Date;
      endDate?: Date;
      symbol?: string;
      limit?: number;
    } = {},
  ): Promise<{
    total: number;
    orders: Array<OrderHistory & { instanceId: string; instanceName: string }>;
  }> {
    const instances = await this.getOnlineInstances(options.tenantId);

    // 构建查询参数
    const queryParams = new URLSearchParams();
    if (options.startDate) {
      queryParams.set('startDate', options.startDate.toISOString());
    }
    if (options.endDate) {
      queryParams.set('endDate', options.endDate.toISOString());
    }
    if (options.symbol) {
      queryParams.set('symbol', options.symbol);
    }
    if (options.limit) {
      queryParams.set('limit', String(options.limit));
    }

    const path = queryParams.toString()
      ? `${MIDDLEWARE_API_PATHS.TRADING_HISTORY}?${queryParams}`
      : MIDDLEWARE_API_PATHS.TRADING_HISTORY;

    const results = await this.fetchFromAllInstances<OrderHistory[]>(instances, path);

    const orders: Array<OrderHistory & { instanceId: string; instanceName: string }> = [];

    results.forEach(result => {
      if (result.success && result.data) {
        result.data.forEach(order => {
          orders.push({
            ...order,
            instanceId: result.instanceId,
            instanceName: result.instanceName,
          });
        });
      }
    });

    // 按关闭时间排序
    return {
      total: orders.length,
      orders: orders.sort(
        (a, b) => new Date(b.closeTime).getTime() - new Date(a.closeTime).getTime(),
      ),
    };
  }

  /**
   * 获取平台概览
   */
  async getPlatformOverview(): Promise<{
    health: HealthSummary;
    trading: AggregatedTradingData;
    circuitBreakers: {
      total: number;
      open: number;
      closed: number;
      halfOpen: number;
    };
  }> {
    const cacheKey = 'platform:overview';
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const [health, trading, circuitBreakers] = await Promise.all([
      this.healthChecker.getHealthSummary(),
      this.getPlatformTradingData(),
      Promise.resolve(this.circuitBreaker.getSummary()),
    ]);

    const overview = { health, trading, circuitBreakers };
    this.setCache(cacheKey, overview, CACHE_TTL.PLATFORM_OVERVIEW);

    return overview;
  }

  /**
   * 获取租户概览
   */
  async getTenantOverview(tenantId: string): Promise<{
    health: HealthSummary;
    trading: AggregatedTradingData;
    instances: {
      id: string;
      name: string;
      status: InstanceStatus;
      latencyMs: number | null;
    }[];
  }> {
    const cacheKey = `tenant:overview:${tenantId}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const [health, trading, instances] = await Promise.all([
      this.healthChecker.getTenantHealthSummary(tenantId),
      this.getTenantTradingData(tenantId),
      this.prisma.middlewareInstance.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          status: true,
          latencyMs: true,
        },
      }),
    ]);

    const overview = {
      health,
      trading,
      instances: instances.map(inst => ({
        id: inst.id,
        name: inst.name,
        status: inst.status as InstanceStatus,
        latencyMs: inst.latencyMs,
      })),
    };

    this.setCache(cacheKey, overview, CACHE_TTL.TENANT_OVERVIEW);

    return overview;
  }

  /**
   * 获取单个实例的详细指标
   */
  async getInstanceMetrics(instanceId: string): Promise<{
    health: any;
    metrics: any;
    stats: any;
  } | null> {
    const instance = await this.getInstanceInfo(instanceId);
    if (!instance) {
      return null;
    }

    if (!this.circuitBreaker.canRequest(instanceId)) {
      this.logger.warn(`Circuit breaker open for instance ${instanceId}, skipping metrics fetch`);
      return null;
    }

    try {
      const [health, metrics, stats] = await Promise.all([
        this.middlewareClient.get(instance, MIDDLEWARE_API_PATHS.HEALTH_DETAILED, { retries: 1 }),
        this.middlewareClient.get(instance, MIDDLEWARE_API_PATHS.MONITOR_METRICS, { retries: 1 }),
        this.middlewareClient.get(instance, MIDDLEWARE_API_PATHS.MONITOR_STATS, { retries: 1 }),
      ]);

      return { health, metrics, stats };
    } catch (error: any) {
      this.logger.error(`Failed to fetch metrics for instance ${instanceId}: ${error.message}`);
      return null;
    }
  }

  /**
   * 清除缓存
   */
  clearCache(pattern?: string): void {
    if (pattern) {
      const keys = Array.from(this.cache.keys()).filter(key => key.includes(pattern));
      keys.forEach(key => this.cache.delete(key));
      this.logger.debug(`Cleared ${keys.length} cache entries matching "${pattern}"`);
    } else {
      this.cache.clear();
      this.logger.debug('Cleared all cache entries');
    }
  }

  /**
   * 获取在线实例列表
   */
  private async getOnlineInstances(tenantId?: string): Promise<MiddlewareInstanceInfo[]> {
    const where: any = {
      status: { in: ['ONLINE', 'DEGRADED'] },
    };

    if (tenantId) {
      where.tenantId = tenantId;
    }

    const instances = await this.prisma.middlewareInstance.findMany({
      where,
      select: {
        id: true,
        name: true,
        host: true,
        port: true,
        apiKey: true,
        useTls: true,
        status: true,
        circuitBreakerState: true,
        consecutiveFailures: true,
        tenantId: true,
      },
    });

    return instances.map(inst => ({
      id: inst.id,
      name: inst.name,
      host: inst.host,
      port: inst.port,
      apiKey: inst.apiKey,
      useTls: inst.useTls ?? false,
      status: inst.status as InstanceStatus,
      circuitBreakerState: (inst.circuitBreakerState || 'CLOSED') as 'CLOSED' | 'OPEN' | 'HALF_OPEN',
      consecutiveFailures: inst.consecutiveFailures ?? 0,
      tenantId: inst.tenantId,
    }));
  }

  /**
   * 获取单个实例信息
   */
  private async getInstanceInfo(instanceId: string): Promise<MiddlewareInstanceInfo | null> {
    const instance = await this.prisma.middlewareInstance.findUnique({
      where: { id: instanceId },
      select: {
        id: true,
        name: true,
        host: true,
        port: true,
        apiKey: true,
        useTls: true,
        status: true,
        circuitBreakerState: true,
        consecutiveFailures: true,
        tenantId: true,
      },
    });

    if (!instance) {
      return null;
    }

    return {
      id: instance.id,
      name: instance.name,
      host: instance.host,
      port: instance.port,
      apiKey: instance.apiKey,
      useTls: instance.useTls ?? false,
      status: instance.status as InstanceStatus,
      circuitBreakerState: (instance.circuitBreakerState || 'CLOSED') as 'CLOSED' | 'OPEN' | 'HALF_OPEN',
      consecutiveFailures: instance.consecutiveFailures ?? 0,
      tenantId: instance.tenantId,
    };
  }

  /**
   * 从所有实例并行获取数据
   */
  private async fetchFromAllInstances<T>(
    instances: MiddlewareInstanceInfo[],
    path: string,
  ): Promise<InstanceDataResponse<T>[]> {
    const results = await Promise.all(
      instances.map(async instance => {
        // 检查熔断器
        if (!this.circuitBreaker.canRequest(instance.id)) {
          return {
            instanceId: instance.id,
            instanceName: instance.name,
            success: false,
            error: 'Circuit breaker open',
          };
        }

        try {
          const data = await this.middlewareClient.get<T>(instance, path, {
            retries: 1,
            timeout: 10000,
          });

          return {
            instanceId: instance.id,
            instanceName: instance.name,
            success: true,
            data,
          };
        } catch (error: any) {
          return {
            instanceId: instance.id,
            instanceName: instance.name,
            success: false,
            error: error.message,
          };
        }
      }),
    );

    return results;
  }

  /**
   * 聚合余额数据
   */
  private aggregateBalances(
    results: InstanceDataResponse<AccountBalance[]>[],
  ): AggregatedTradingData {
    const aggregated: AggregatedTradingData = {
      totalAccounts: 0,
      totalBalance: 0,
      totalEquity: 0,
      totalProfit: 0,
      activePositions: 0,
      byCurrency: {},
      lastUpdated: new Date(),
    };

    results.forEach(result => {
      if (result.success && result.data) {
        result.data.forEach(account => {
          aggregated.totalAccounts++;
          aggregated.totalBalance += account.balance;
          aggregated.totalEquity += account.equity;
          aggregated.totalProfit += account.equity - account.balance;

          // 按货币分组
          if (!aggregated.byCurrency[account.currency]) {
            aggregated.byCurrency[account.currency] = {
              count: 0,
              balance: 0,
              equity: 0,
            };
          }

          aggregated.byCurrency[account.currency].count++;
          aggregated.byCurrency[account.currency].balance += account.balance;
          aggregated.byCurrency[account.currency].equity += account.equity;
        });
      }
    });

    return aggregated;
  }

  /**
   * 从缓存获取数据
   */
  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    if (new Date() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached.data as T;
  }

  /**
   * 设置缓存
   */
  private setCache(key: string, data: any, ttlSeconds: number): void {
    const now = new Date();
    this.cache.set(key, {
      data,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
    });
  }
}
