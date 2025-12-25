import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { MiddlewareStatus, Prisma } from '@prisma/client';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { of } from 'rxjs';

/**
 * 中间件健康数据接口 (匹配 MT5-middleware /health/detailed 响应格式)
 */
interface MiddlewareHealthData {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service?: string;
  version?: string;
  uptime_seconds?: number;
  metrics?: {
    cpu_usage_percent?: number; // 系统级 CPU 使用率
    process_cpu_usage_percent?: number; // 进程级 CPU 使用率
    memory_usage_mb?: number; // 系统级内存使用量
    memory_total_mb?: number; // 系统级内存总容量
    memory_usage_percent?: number; // 系统级内存使用率
    process_memory_mb?: number; // 进程级内存使用量
    disk_usage_gb?: number;
    disk_usage_percent?: number;
    disk_total_gb?: number;
    connections?: {
      total?: number;
      http?: number;
      websocket?: number;
    };
    throughput?: {
      api_calls_per_second?: number;
      orders_per_second?: number;
      ticks_per_second?: number;
    };
    errors?: {
      total?: number;
      last_hour?: number;
    };
  };
  components?: Record<string, unknown>;
  circuit_breakers?: unknown[];
}

/**
 * 中间件健康检查服务
 * 定期检查所有注册的中间件健康状态
 */
@Injectable()
export class HealthCheckService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HealthCheckService.name);
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;
  private readonly timeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    // 健康检查间隔，默认 30 秒
    this.intervalMs = this.configService.get<number>('MIDDLEWARE_HEALTH_CHECK_INTERVAL', 30000);
    // 请求超时，默认 5 秒
    this.timeoutMs = this.configService.get<number>('MIDDLEWARE_HEALTH_CHECK_TIMEOUT', 5000);
  }

  onModuleInit() {
    this.startHealthCheck();
  }

  onModuleDestroy() {
    this.stopHealthCheck();
  }

  /**
   * 启动健康检查定时任务
   */
  startHealthCheck() {
    if (this.checkInterval) {
      return;
    }

    this.logger.log(`启动中间件健康检查，间隔: ${this.intervalMs}ms`);

    // 立即执行一次
    this.checkAllMiddlewares();

    // 设置定时任务
    this.checkInterval = setInterval(() => {
      this.checkAllMiddlewares();
    }, this.intervalMs);
  }

  /**
   * 停止健康检查定时任务
   */
  stopHealthCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      this.logger.log('停止中间件健康检查');
    }
  }

  /**
   * 检查所有中间件的健康状态
   */
  async checkAllMiddlewares(): Promise<void> {
    try {
      const middlewares = await this.prisma.middleware.findMany({
        select: {
          id: true,
          name: true,
          url: true,
          apiKey: true,
        },
      });

      if (middlewares.length === 0) {
        return;
      }

      // 过滤掉尚未注册的中间件 (没有 apiKey 表示中间件还未启动注册)
      const registeredMiddlewares = middlewares.filter((mw) => mw.apiKey);

      if (registeredMiddlewares.length === 0) {
        this.logger.debug('没有已注册的中间件需要检查');
        return;
      }

      this.logger.debug(`检查 ${registeredMiddlewares.length} 个中间件的健康状态`);

      // 并行检查所有中间件
      await Promise.all(
        registeredMiddlewares.map((mw) => this.checkMiddlewareHealth(mw.id, mw.url, mw.apiKey!, mw.name)),
      );
    } catch (error) {
      this.logger.error(`健康检查失败: ${error.message}`);
    }
  }

  /**
   * 检查单个中间件的健康状态
   * @param id 中间件 ID
   * @param url 中间件 URL
   * @param apiKey API Key
   * @param name 中间件名称 (用于日志)
   */
  async checkMiddlewareHealth(
    id: string,
    url: string,
    apiKey: string,
    name: string,
  ): Promise<void> {
    // 使用 /health/detailed 端点获取详细健康信息
    const healthUrl = `${url}/health/detailed`;

    try {
      const response = await firstValueFrom(
        this.httpService
          .get<MiddlewareHealthData>(healthUrl, {
            headers: {
              'X-API-Key': apiKey,
            },
            timeout: this.timeoutMs,
          })
          .pipe(
            timeout(this.timeoutMs),
            catchError((error) => {
              this.logger.warn(`中间件 ${name} 健康检查失败: ${error.message}`);
              return of(null);
            }),
          ),
      );

      if (response && response.data) {
        const healthData = response.data;
        const status = this.mapHealthStatus(healthData.status);
        const metrics = healthData.metrics;

        await this.updateMiddlewareHealth(id, {
          status,
          activeSessions: metrics?.connections?.total ?? 0,
          memoryUsage: metrics?.memory_usage_mb,
          memoryTotal: metrics?.memory_total_mb,
          memoryUsagePercent: metrics?.memory_usage_percent,
          processMemory: metrics?.process_memory_mb,
          cpuUsage: metrics?.cpu_usage_percent,
          processCpuUsage: metrics?.process_cpu_usage_percent,
          diskUsage: metrics?.disk_usage_gb,
          diskUsagePercent: metrics?.disk_usage_percent,
          diskTotal: metrics?.disk_total_gb,
        });

        if (status !== MiddlewareStatus.ONLINE) {
          this.logger.warn(`中间件 ${name} 状态: ${status}`);
        }
      } else {
        // 请求失败，标记为离线
        await this.updateMiddlewareHealth(id, {
          status: MiddlewareStatus.OFFLINE,
        });
        this.logger.warn(`中间件 ${name} 无响应，标记为离线`);
      }
    } catch (error) {
      // 发生错误，标记为错误状态
      await this.updateMiddlewareHealth(id, {
        status: MiddlewareStatus.ERROR,
      });
      this.logger.error(`中间件 ${name} 健康检查异常: ${error.message}`);
    }
  }

  /**
   * 更新中间件健康状态
   */
  private async updateMiddlewareHealth(
    id: string,
    data: {
      status: MiddlewareStatus;
      serverIp?: string;
      activeSessions?: number;
      memoryUsage?: number;
      memoryTotal?: number;
      memoryUsagePercent?: number;
      processMemory?: number;
      cpuUsage?: number;
      processCpuUsage?: number;
      diskUsage?: number;
      diskUsagePercent?: number;
      diskTotal?: number;
      cacheStatus?: Record<string, unknown>;
    },
  ): Promise<void> {
    // 只有在中间件在线时才更新 lastHeartbeat
    const isOnline = data.status === MiddlewareStatus.ONLINE || data.status === MiddlewareStatus.DEGRADED;

    await this.prisma.middleware.update({
      where: { id },
      data: {
        status: data.status,
        serverIp: data.serverIp,
        activeSessions: isOnline ? data.activeSessions : 0,
        memoryUsage: isOnline ? data.memoryUsage : null,
        memoryTotal: isOnline ? data.memoryTotal : null,
        memoryUsagePercent: isOnline ? data.memoryUsagePercent : null,
        processMemory: isOnline ? data.processMemory : null,
        cpuUsage: isOnline ? data.cpuUsage : null,
        processCpuUsage: isOnline ? data.processCpuUsage : null,
        diskUsage: isOnline ? data.diskUsage : null,
        diskUsagePercent: isOnline ? data.diskUsagePercent : null,
        diskTotal: isOnline ? data.diskTotal : null,
        cacheStatus: isOnline ? (data.cacheStatus as object | undefined) : Prisma.DbNull,
        // 只有在中间件成功响应时才更新心跳时间
        ...(isOnline && { lastHeartbeat: new Date() }),
      },
    });
  }

  /**
   * 将健康状态字符串映射为枚举
   */
  private mapHealthStatus(status: string): MiddlewareStatus {
    switch (status) {
      case 'healthy':
        return MiddlewareStatus.ONLINE;
      case 'degraded':
        return MiddlewareStatus.DEGRADED;
      case 'unhealthy':
        return MiddlewareStatus.ERROR;
      default:
        return MiddlewareStatus.UNKNOWN;
    }
  }

  /**
   * 手动触发单个中间件的健康检查
   * @param id 中间件 ID
   */
  async triggerHealthCheck(id: string): Promise<MiddlewareStatus> {
    const middleware = await this.prisma.middleware.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        url: true,
        apiKey: true,
      },
    });

    if (!middleware) {
      throw new Error(`中间件 ${id} 不存在`);
    }

    // 检查中间件是否已注册 (有 apiKey)
    if (!middleware.apiKey) {
      throw new Error(`中间件 ${middleware.name} 尚未注册，无法进行健康检查`);
    }

    await this.checkMiddlewareHealth(
      middleware.id,
      middleware.url,
      middleware.apiKey,
      middleware.name,
    );

    // 返回更新后的状态
    const updated = await this.prisma.middleware.findUnique({
      where: { id },
      select: { status: true },
    });

    return updated?.status ?? MiddlewareStatus.UNKNOWN;
  }

  /**
   * 测试中间件连接
   * @param id 中间件 ID
   * @returns 连接测试结果，包含延迟时间
   */
  async testConnection(id: string): Promise<{ success: boolean; message: string; latency?: number }> {
    const middleware = await this.prisma.middleware.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        url: true,
        apiKey: true,
      },
    });

    if (!middleware) {
      return { success: false, message: `中间件不存在` };
    }

    const healthUrl = `${middleware.url}/health`;
    const startTime = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService
          .get(healthUrl, {
            headers: {
              'X-API-Key': middleware.apiKey,
            },
            timeout: this.timeoutMs,
          })
          .pipe(
            timeout(this.timeoutMs),
            catchError((error) => {
              return of({ data: null, error: error.message });
            }),
          ),
      );

      const latency = Date.now() - startTime;

      if (response && response.data && !('error' in response)) {
        return {
          success: true,
          message: `连接成功`,
          latency,
        };
      } else {
        const errorMsg = 'error' in response ? (response as any).error : '无响应';
        return {
          success: false,
          message: `连接失败: ${errorMsg}`,
          latency,
        };
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        success: false,
        message: `连接异常: ${error.message}`,
        latency,
      };
    }
  }
}
