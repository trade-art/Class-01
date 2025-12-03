import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { MiddlewareClientService } from './middleware-client.service';
import { CircuitBreakerService, CircuitState } from './circuit-breaker.service';
import { EventEmitterService } from './event-emitter.service';
import {
  MiddlewareInstanceInfo,
  HealthCheckResult,
  MiddlewareHealth,
  HealthSummary,
  InstanceStatus,
} from '../interfaces/middleware-health.interface';
import { HEALTH_CHECK_CONFIG, CACHE_KEYS, CACHE_TTL } from '../constants/middleware.constants';

/**
 * 健康检查缓存项
 */
interface CachedHealthStatus {
  result: HealthCheckResult;
  cachedAt: Date;
  expiresAt: Date;
}

/**
 * 健康检查服务
 * 定时检查中间件实例健康状态，发送告警，更新数据库
 * middleware-integration Task 7
 */
@Injectable()
export class HealthCheckerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HealthCheckerService.name);

  // 内存缓存 (生产环境应使用 Redis)
  private healthCache = new Map<string, CachedHealthStatus>();

  // 健康检查是否正在运行
  private isRunning = false;

  // 连续失败计数器
  private failureCounters = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly middlewareClient: MiddlewareClientService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly eventEmitter: EventEmitterService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('HealthCheckerService initialized');
    // 启动时执行一次健康检查
    await this.runHealthChecks();
  }

  onModuleDestroy(): void {
    this.healthCache.clear();
    this.failureCounters.clear();
    this.logger.log('HealthCheckerService destroyed');
  }

  /**
   * 定时健康检查任务 (每分钟执行)
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async scheduledHealthCheck(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Health check already running, skipping this cycle');
      return;
    }

    await this.runHealthChecks();
  }

  /**
   * 执行所有实例的健康检查
   */
  async runHealthChecks(): Promise<HealthCheckResult[]> {
    this.isRunning = true;
    const startTime = Date.now();

    try {
      // 获取所有活跃的中间件实例
      const instances = await this.getActiveInstances();

      if (instances.length === 0) {
        this.logger.debug('No active instances to check');
        return [];
      }

      this.logger.log(`Starting health check for ${instances.length} instances`);

      // 并行执行健康检查
      const results = await Promise.all(
        instances.map(instance => this.checkInstanceHealth(instance)),
      );

      // 更新数据库状态
      await this.updateInstanceStatuses(results);

      const duration = Date.now() - startTime;
      this.logger.log(
        `Health check completed in ${duration}ms. Results: ${this.summarizeResults(results)}`,
      );

      return results;
    } catch (error: any) {
      this.logger.error(`Health check cycle failed: ${error.message}`, error.stack);
      return [];
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 检查单个实例的健康状态
   */
  async checkInstanceHealth(instance: MiddlewareInstanceInfo): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // 尝试获取详细健康信息
      const healthData = await this.middlewareClient.get<MiddlewareHealth>(
        instance,
        '/health/detailed',
        {
          timeout: HEALTH_CHECK_CONFIG.TIMEOUT_MS,
          retries: 1,
          skipCircuitBreaker: false,
        },
      );

      const latencyMs = Date.now() - startTime;
      const status = this.mapHealthToStatus(healthData);

      // 成功，重置失败计数
      this.failureCounters.set(instance.id, 0);

      const result: HealthCheckResult = {
        instanceId: instance.id,
        status,
        latencyMs,
        data: healthData,
        checkedAt: new Date(),
      };

      // 缓存结果
      this.cacheResult(instance.id, result);

      // 如果之前是离线/错误状态，现在恢复，发送事件
      if (instance.status !== status &&
          (instance.status === 'OFFLINE' || instance.status === 'ERROR')) {
        await this.eventEmitter.emitStatusChange(
          instance.id,
          instance.status,
          status,
          'Health check succeeded',
        );
      }

      return result;
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;

      // 增加失败计数
      const failures = (this.failureCounters.get(instance.id) || 0) + 1;
      this.failureCounters.set(instance.id, failures);

      // 确定新状态
      const newStatus: InstanceStatus = failures >= HEALTH_CHECK_CONFIG.ALERT_THRESHOLD
        ? 'OFFLINE'
        : 'ERROR';

      const result: HealthCheckResult = {
        instanceId: instance.id,
        status: newStatus,
        latencyMs,
        data: null,
        errorMessage: error.message,
        checkedAt: new Date(),
      };

      // 缓存结果
      this.cacheResult(instance.id, result);

      // 发送告警
      if (failures >= HEALTH_CHECK_CONFIG.ALERT_THRESHOLD) {
        await this.eventEmitter.emitHealthCheckAlert(
          instance.id,
          failures,
          error.message,
        );
      }

      // 状态变更事件
      if (instance.status !== newStatus) {
        await this.eventEmitter.emitStatusChange(
          instance.id,
          instance.status,
          newStatus,
          error.message,
        );
      }

      return result;
    }
  }

  /**
   * 获取实例的缓存健康状态
   */
  getCachedHealth(instanceId: string): HealthCheckResult | null {
    const cached = this.healthCache.get(instanceId);

    if (!cached) {
      return null;
    }

    // 检查是否过期
    if (new Date() > cached.expiresAt) {
      this.healthCache.delete(instanceId);
      return null;
    }

    return cached.result;
  }

  /**
   * 获取健康状态摘要
   */
  async getHealthSummary(): Promise<HealthSummary> {
    const instances = await this.prisma.middlewareInstance.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    const summary: HealthSummary = {
      total: 0,
      online: 0,
      offline: 0,
      error: 0,
      degraded: 0,
      lastUpdated: new Date(),
    };

    instances.forEach((group: { status: string; _count: { status: number } }) => {
      const count = group._count.status;
      summary.total += count;

      switch (group.status) {
        case 'ONLINE':
          summary.online = count;
          break;
        case 'OFFLINE':
          summary.offline = count;
          break;
        case 'ERROR':
          summary.error = count;
          break;
        case 'DEGRADED':
          summary.degraded = count;
          break;
      }
    });

    return summary;
  }

  /**
   * 获取特定租户的健康摘要
   */
  async getTenantHealthSummary(tenantId: string): Promise<HealthSummary> {
    const instances = await this.prisma.middlewareInstance.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { status: true },
    });

    const summary: HealthSummary = {
      total: 0,
      online: 0,
      offline: 0,
      error: 0,
      degraded: 0,
      lastUpdated: new Date(),
    };

    instances.forEach((group: { status: string; _count: { status: number } }) => {
      const count = group._count.status;
      summary.total += count;

      switch (group.status) {
        case 'ONLINE':
          summary.online = count;
          break;
        case 'OFFLINE':
          summary.offline = count;
          break;
        case 'ERROR':
          summary.error = count;
          break;
        case 'DEGRADED':
          summary.degraded = count;
          break;
      }
    });

    return summary;
  }

  /**
   * 手动触发单个实例的健康检查
   */
  async checkSingleInstance(instanceId: string): Promise<HealthCheckResult> {
    const instance = await this.getInstanceInfo(instanceId);

    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    return this.checkInstanceHealth(instance);
  }

  /**
   * 清除健康缓存
   */
  clearCache(instanceId?: string): void {
    if (instanceId) {
      this.healthCache.delete(instanceId);
      this.logger.debug(`Cleared health cache for instance ${instanceId}`);
    } else {
      this.healthCache.clear();
      this.logger.debug('Cleared all health caches');
    }
  }

  /**
   * 获取所有活跃实例
   */
  private async getActiveInstances(): Promise<MiddlewareInstanceInfo[]> {
    const instances = await this.prisma.middlewareInstance.findMany({
      where: {
        status: { notIn: ['MAINTENANCE'] },
      },
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
   * 更新实例状态到数据库
   */
  private async updateInstanceStatuses(results: HealthCheckResult[]): Promise<void> {
    const updates = results.map(result =>
      this.prisma.middlewareInstance.update({
        where: { id: result.instanceId },
        data: {
          status: result.status,
          latencyMs: result.latencyMs,
          errorMessage: result.errorMessage || null,
          consecutiveFailures: this.failureCounters.get(result.instanceId) || 0,
          circuitBreakerState: this.circuitBreaker.getState(result.instanceId).state,
          lastCheckedAt: result.checkedAt,
        },
      }),
    );

    try {
      await this.prisma.$transaction(updates);
    } catch (error: any) {
      this.logger.error(`Failed to update instance statuses: ${error.message}`);
    }
  }

  /**
   * 缓存健康检查结果
   */
  private cacheResult(instanceId: string, result: HealthCheckResult): void {
    const now = new Date();
    const ttlMs = CACHE_TTL.HEALTH_STATUS * 1000;

    this.healthCache.set(instanceId, {
      result,
      cachedAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
    });
  }

  /**
   * 将中间件健康状态映射到实例状态
   */
  private mapHealthToStatus(health: MiddlewareHealth): InstanceStatus {
    switch (health.status) {
      case 'healthy':
        return 'ONLINE';
      case 'degraded':
        return 'DEGRADED';
      case 'unhealthy':
        return 'ERROR';
      default:
        return 'ERROR';
    }
  }

  /**
   * 汇总健康检查结果
   */
  private summarizeResults(results: HealthCheckResult[]): string {
    const online = results.filter(r => r.status === 'ONLINE').length;
    const offline = results.filter(r => r.status === 'OFFLINE').length;
    const error = results.filter(r => r.status === 'ERROR').length;
    const degraded = results.filter(r => r.status === 'DEGRADED').length;

    return `Online: ${online}, Offline: ${offline}, Error: ${error}, Degraded: ${degraded}`;
  }
}
