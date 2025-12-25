import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { firstValueFrom, catchError, timeout } from 'rxjs';
import { AxiosError } from 'axios';

/**
 * 连接池变更通知类型
 */
export enum PoolChangeType {
  ADD = 'add',           // 添加新连接
  REMOVE = 'remove',     // 移除连接
  UPDATE = 'update',     // 更新连接（密码变更等）
  RECONNECT = 'reconnect', // 触发重连
}

/**
 * 经理账号信息（用于通知中间件）
 */
export interface ManagerNotifyInfo {
  managerId: string;
  tenantId: string;
  mtServerId: string;
  serverAddress: string;
  managerLogin: string;
  encryptedPassword?: string;  // 仅在 ADD 和 UPDATE 时需要
}

/**
 * 通知结果
 */
export interface NotifyResult {
  success: boolean;
  middlewareId: string;
  middlewareUrl: string;
  error?: string;
  responseTime?: number;
  taskId?: string;  // 异步任务 ID (使用异步 API 时返回)
}

/**
 * 中间件连接池通知器
 *
 * 用于在经理账号发生变更时通知相关的中间件更新连接池
 *
 * Requirements: REQ-6
 */
@Injectable()
export class MiddlewareNotifierService {
  private readonly logger = new Logger(MiddlewareNotifierService.name);

  /** 内部 API 调用密钥 */
  private readonly internalSecret: string;

  /** HTTP 请求超时时间 (毫秒) */
  private readonly requestTimeout: number;

  /** 最大重试次数 */
  private readonly maxRetries: number;

  /** 重试基础延迟 (毫秒) */
  private readonly retryBaseDelay: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.internalSecret = this.configService.get<string>(
      'INTERNAL_API_SECRET',
      'internal-secret-change-me',
    );
    // 增加默认超时到 30 秒（中间件繁忙时需要更多时间）
    this.requestTimeout = this.configService.get<number>(
      'MIDDLEWARE_NOTIFY_TIMEOUT',
      30000,
    );
    // 最多重试 3 次
    this.maxRetries = this.configService.get<number>(
      'MIDDLEWARE_NOTIFY_MAX_RETRIES',
      3,
    );
    // 重试基础延迟 2 秒（指数退避：2s, 4s, 8s）
    this.retryBaseDelay = this.configService.get<number>(
      'MIDDLEWARE_NOTIFY_RETRY_DELAY',
      2000,
    );
  }

  /**
   * 通知中间件添加新连接
   *
   * @param managerInfo 经理账号信息
   * @returns 通知结果
   */
  async notifyAdd(managerInfo: ManagerNotifyInfo): Promise<NotifyResult> {
    return this.notifyMiddleware(PoolChangeType.ADD, managerInfo);
  }

  /**
   * 通知中间件移除连接
   *
   * @param managerId 经理账号 UUID
   * @param mtServerId MT 服务器 ID
   * @returns 通知结果
   */
  async notifyRemove(
    managerId: string,
    mtServerId: string,
  ): Promise<NotifyResult> {
    const managerInfo: ManagerNotifyInfo = {
      managerId,
      tenantId: '',
      mtServerId,
      serverAddress: '',
      managerLogin: '',
    };
    return this.notifyMiddleware(PoolChangeType.REMOVE, managerInfo);
  }

  /**
   * 通知中间件更新连接（密码变更）
   *
   * @param managerInfo 经理账号信息（包含新的加密密码）
   * @returns 通知结果
   */
  async notifyUpdate(managerInfo: ManagerNotifyInfo): Promise<NotifyResult> {
    return this.notifyMiddleware(PoolChangeType.UPDATE, managerInfo);
  }

  /**
   * 通知中间件触发重连
   *
   * @param managerId 经理账号 UUID
   * @param mtServerId MT 服务器 ID
   * @returns 通知结果
   */
  async notifyReconnect(
    managerId: string,
    mtServerId: string,
  ): Promise<NotifyResult> {
    const managerInfo: ManagerNotifyInfo = {
      managerId,
      tenantId: '',
      mtServerId,
      serverAddress: '',
      managerLogin: '',
    };
    return this.notifyMiddleware(PoolChangeType.RECONNECT, managerInfo);
  }

  /**
   * 通用通知方法（带重试逻辑）
   *
   * @param changeType 变更类型
   * @param managerInfo 经理账号信息
   * @returns 通知结果
   */
  private async notifyMiddleware(
    changeType: PoolChangeType,
    managerInfo: ManagerNotifyInfo,
  ): Promise<NotifyResult> {
    const startTime = Date.now();

    // 获取中间件配置
    const server = await this.prisma.mtServer.findUnique({
      where: { id: managerInfo.mtServerId },
      select: {
        middlewareId: true,
        middlewareUrl: true,
      },
    });

    if (!server?.middlewareId || !server?.middlewareUrl) {
      this.logger.debug(
        `跳过通知: MT 服务器 ${managerInfo.mtServerId} 未配置中间件`,
      );
      return {
        success: true,
        middlewareId: '',
        middlewareUrl: '',
        error: 'Middleware not configured',
      };
    }

    const middlewareUrl = server.middlewareUrl;
    const middlewareId = server.middlewareId;

    let endpoint: string;
    let method: 'POST' | 'DELETE';
    let body: Record<string, unknown> | undefined;

    // 使用异步 API 端点 (/async 后缀)
    // 异步 API 立即返回任务 ID，不阻塞中间件 HTTP 线程
    // 这是解决 MT5 DLL Release 阻塞问题的关键
    switch (changeType) {
      case PoolChangeType.ADD:
        endpoint = `${middlewareUrl}/api/v1/pool/connections/async`;
        method = 'POST';
        body = {
          managerId: managerInfo.managerId,
          tenantId: managerInfo.tenantId,
          mtServerId: managerInfo.mtServerId,
          serverAddress: managerInfo.serverAddress,
          managerLogin: managerInfo.managerLogin,
          encryptedPassword: managerInfo.encryptedPassword,
        };
        break;

      case PoolChangeType.REMOVE:
        endpoint = `${middlewareUrl}/api/v1/pool/connections/${managerInfo.managerId}/async`;
        method = 'DELETE';
        break;

      case PoolChangeType.UPDATE:
      case PoolChangeType.RECONNECT:
        endpoint = `${middlewareUrl}/api/v1/pool/connections/${managerInfo.managerId}/reconnect/async`;
        method = 'POST';
        if (changeType === PoolChangeType.UPDATE && managerInfo.encryptedPassword) {
          body = {
            encryptedPassword: managerInfo.encryptedPassword,
          };
        }
        break;
    }

    // 带重试的请求发送
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // 如果不是第一次尝试，等待一段时间（指数退避）
        if (attempt > 0) {
          const delay = this.retryBaseDelay * Math.pow(2, attempt - 1);
          this.logger.debug(
            `重试通知 ${changeType} ${managerInfo.managerId} (第 ${attempt} 次, 延迟 ${delay}ms)`,
          );
          await this.sleep(delay);
        }

        const headers = {
          'Content-Type': 'application/json',
          'X-Internal-Secret': this.internalSecret,
        };

        const request$ =
          method === 'DELETE'
            ? this.httpService.delete(endpoint, { headers })
            : this.httpService.post(endpoint, body, { headers });

        const response = await firstValueFrom(
          request$.pipe(
            timeout(this.requestTimeout),
            catchError((error: AxiosError) => {
              throw error;
            }),
          ),
        );

        const responseTime = Date.now() - startTime;

        // 异步 API 返回 taskId
        const taskId = response.data?.data?.taskId;

        this.logger.log(
          `通知中间件成功: ${changeType} ${managerInfo.managerId} -> ${middlewareUrl} (${responseTime}ms${attempt > 0 ? `, 重试 ${attempt} 次` : ''}${taskId ? `, taskId=${taskId}` : ''})`,
        );

        return {
          success: true,
          middlewareId,
          middlewareUrl,
          responseTime,
          taskId,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        const errorMessage =
          error instanceof AxiosError
            ? error.response?.data?.message || error.message
            : lastError.message;

        // 如果是最后一次尝试，记录警告日志
        if (attempt === this.maxRetries) {
          const responseTime = Date.now() - startTime;
          this.logger.warn(
            `通知中间件失败 (已重试 ${this.maxRetries} 次): ${changeType} ${managerInfo.managerId} - ${errorMessage} (${responseTime}ms)`,
          );
        } else {
          this.logger.debug(
            `通知中间件第 ${attempt + 1} 次尝试失败: ${changeType} ${managerInfo.managerId} - ${errorMessage}`,
          );
        }
      }
    }

    // 所有重试都失败
    const responseTime = Date.now() - startTime;
    const errorMessage = lastError?.message || 'Unknown error';

    return {
      success: false,
      middlewareId,
      middlewareUrl,
      error: errorMessage,
      responseTime,
    };
  }

  /**
   * 延迟辅助方法
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 批量通知所有相关中间件刷新连接
   * 用于系统级维护操作
   *
   * @param tenantId 租户 ID (可选，不提供则通知所有中间件)
   * @returns 通知结果列表
   */
  async notifyRefreshAll(tenantId?: string): Promise<NotifyResult[]> {
    const results: NotifyResult[] = [];

    try {
      // 获取所有相关的中间件
      const whereClause = tenantId ? { tenantId, isActive: true } : { isActive: true };

      const servers = await this.prisma.mtServer.findMany({
        where: whereClause,
        select: {
          middlewareId: true,
          middlewareUrl: true,
        },
        distinct: ['middlewareId'],
      });

      // 过滤已配置中间件的服务器
      const middlewares = servers.filter(
        (s) => s.middlewareId && s.middlewareUrl,
      );

      this.logger.log(`批量刷新通知: 共 ${middlewares.length} 个中间件`);

      // 并行通知所有中间件
      const promises = middlewares.map(async (server) => {
        const startTime = Date.now();

        try {
          const endpoint = `${server.middlewareUrl}/api/v1/pool/refresh`;
          const response = await firstValueFrom(
            this.httpService
              .post(
                endpoint,
                {},
                {
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Internal-Secret': this.internalSecret,
                  },
                },
              )
              .pipe(
                timeout(this.requestTimeout * 2), // 批量刷新给更长超时
                catchError((error: AxiosError) => {
                  throw error;
                }),
              ),
          );

          return {
            success: true,
            middlewareId: server.middlewareId!,
            middlewareUrl: server.middlewareUrl!,
            responseTime: Date.now() - startTime,
          };
        } catch (error) {
          return {
            success: false,
            middlewareId: server.middlewareId!,
            middlewareUrl: server.middlewareUrl!,
            error:
              error instanceof Error ? error.message : 'Unknown error',
            responseTime: Date.now() - startTime,
          };
        }
      });

      const allResults = await Promise.all(promises);
      results.push(...allResults);

      const successCount = results.filter((r) => r.success).length;
      this.logger.log(
        `批量刷新完成: ${successCount}/${results.length} 成功`,
      );
    } catch (error) {
      this.logger.error('批量刷新通知失败', error);
    }

    return results;
  }
}
