import { Injectable, Logger, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { AxiosError } from 'axios';
import { BusinessException, ErrorCodes } from '../../common';
import {
  ResponseTransformer,
  MiddlewareRawResponse,
} from '../transformers/response.transformer';
import { MtServerService } from './mt-server.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ServiceTokenService, GenerateTokenRequest, GeneratePoolModeTokenRequest } from '../../auth/services/service-token.service';

/**
 * 中间件会话信息
 */
export interface MiddlewareSession {
  /** 访问令牌 */
  accessToken: string;
  /** 刷新令牌 */
  refreshToken: string;
  /** 过期时间 */
  expiresAt: Date;
  /** 会话 ID */
  sessionId: string;
  /** 实例 ID */
  instanceId: string;
}

/**
 * 中间件登录请求
 */
interface MiddlewareLoginRequest {
  login: number;
  password: string;
}

/**
 * 中间件登录响应
 */
interface MiddlewareLoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // 秒
  token_type: string;
  session_id?: string;
}

/**
 * 缓存条目
 */
interface CacheEntry {
  session: MiddlewareSession;
  refreshTimer?: ReturnType<typeof setTimeout>;
}

/**
 * 中间件认证服务
 * 管理与 MT5 中间件的 JWT 会话
 */
@Injectable()
export class MiddlewareAuthService implements OnModuleDestroy {
  private readonly logger = new Logger(MiddlewareAuthService.name);

  /**
   * 会话缓存
   * Key: tenantId:serverId (多租户模式) 或 instanceId (向后兼容)
   * Value: CacheEntry (session + refresh timer)
   */
  private readonly sessionCache = new Map<string, CacheEntry>();

  /**
   * 构建缓存键
   * 优先使用 tenantId + serverId 组合，否则回退到 instanceId
   */
  private buildCacheKey(instanceId: string, tenantId?: string, serverId?: string): string {
    if (tenantId) {
      return `${tenantId}:${serverId || 'default'}`;
    }
    return instanceId || 'default';
  }

  /**
   * Token 提前刷新时间 (5 分钟)
   */
  private readonly refreshBeforeExpiry = 5 * 60 * 1000;

  /**
   * 请求超时时间
   */
  private readonly requestTimeout: number;

  /**
   * 中间件基础 URL
   */
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly responseTransformer: ResponseTransformer,
    @Inject(forwardRef(() => MtServerService))
    private readonly mtServerService: MtServerService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ServiceTokenService))
    private readonly serviceTokenService: ServiceTokenService,
  ) {
    this.baseUrl = this.configService.get<string>('middleware.baseUrl')!;
    this.requestTimeout = this.configService.get<number>('middleware.timeout')!;
  }

  /**
   * 模块销毁时清理所有定时器
   */
  onModuleDestroy() {
    this.clearAllSessions();
  }

  /**
   * 获取或创建中间件会话
   * 如果会话不存在或已过期，自动登录获取新会话
   *
   * @param instanceId 实例 ID
   * @param credentials 可选的登录凭证 (如果未提供，将从数据库获取)
   * @param tenantId 租户 ID (从数据库获取凭证时需要)
   * @param serverId MT 服务器 ID (多租户模式)
   * @returns 中间件会话
   */
  async getSession(
    instanceId: string,
    credentials?: { login: number; password: string },
    tenantId?: string,
    serverId?: string,
  ): Promise<MiddlewareSession> {
    // 解析实际的 serverId（确保缓存键与 login() 一致）
    let resolvedServerId = serverId;
    if (!resolvedServerId && tenantId && !credentials) {
      // 如果没有提供 serverId 且需要从数据库获取凭证，先解析 serverId
      try {
        const serverConfig = await this.mtServerService.getDefaultServerConfig(tenantId);
        resolvedServerId = serverConfig.serverId;
        this.logger.debug(`解析 serverId: tenantId=${tenantId}, serverId=${resolvedServerId}`);
      } catch (error) {
        // 如果获取失败，继续使用 undefined（login() 会再次尝试）
        this.logger.debug(`获取 serverId 失败，将在 login() 中重试: ${error}`);
      }
    }

    // 构建缓存键（使用解析后的 serverId）
    const cacheKey = this.buildCacheKey(instanceId, tenantId, resolvedServerId);

    // 检查缓存
    const cached = this.sessionCache.get(cacheKey);
    if (cached && this.isSessionValid(cached.session)) {
      this.logger.debug(`会话缓存命中: ${cacheKey}`);
      return cached.session;
    }

    // 会话不存在或已过期，需要登录
    this.logger.debug(`会话不存在或已过期，重新登录: ${cacheKey}`);
    return this.login(instanceId, credentials, tenantId, resolvedServerId);
  }

  /**
   * 获取访问令牌
   * 便捷方法，直接返回 access token
   *
   * @param instanceId 实例 ID
   * @param credentials 可选的登录凭证 (如果未提供，将从数据库获取)
   * @param tenantId 租户 ID (从数据库获取凭证时需要)
   * @param serverId MT 服务器 ID (多租户模式)
   * @returns 访问令牌
   */
  async getAccessToken(
    instanceId: string,
    credentials?: { login: number; password: string },
    tenantId?: string,
    serverId?: string,
  ): Promise<string> {
    const session = await this.getSession(instanceId, credentials, tenantId, serverId);
    return session.accessToken;
  }

  /**
   * 获取 Service Token 认证头 (推荐方式)
   *
   * 生成包含加密 Manager 凭证的 Service Token，用于 Tenant API → Middleware 通信。
   * 这是新的认证方式，将逐步替代旧的 login() 方法。
   *
   * @param tenantId 租户 ID
   * @param serverId MT 服务器 ID
   * @param scopes 权限范围 (可选，默认为 ['*'])
   * @returns HTTP 请求头对象，包含 Authorization 和 X-Tenant-Id
   */
  async getAuthHeaders(
    tenantId: string,
    serverId?: string,
    scopes?: string[],
  ): Promise<Record<string, string>> {
    // 从数据库获取服务器配置
    const serverConfig = await this.mtServerService.getDefaultServerConfig(tenantId);

    // 确保有 managerId (连接池模式必需)
    if (!serverConfig.managerId) {
      throw new BusinessException({
        code: ErrorCodes.MIDDLEWARE_500_001,
        message: '服务器配置缺少 managerId，无法使用连接池模式',
      });
    }

    // 使用连接池模式生成 Service Token (推荐方式)
    // 连接池模式不需要传递密码，更安全，且中间件可以直接从连接池获取已建立的连接
    const tokenRequest: GeneratePoolModeTokenRequest = {
      managerId: serverConfig.managerId,
      tenantId,
      scopes: scopes || ['*'],
    };

    // 使用 ServiceTokenService 生成连接池模式 Token
    const tokenResponse = this.serviceTokenService.generatePoolModeToken(tokenRequest);

    this.logger.debug(
      `生成 Pool Mode Service Token: tenantId=${tenantId}, managerId=${serverConfig.managerId}, serverId=${serverConfig.serverId}, expiresAt=${tokenResponse.expiresAt}`,
    );

    // 构建认证头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `${tokenResponse.tokenType} ${tokenResponse.token}`,
      'X-Tenant-Id': tenantId,
    };

    // 添加服务器地址 (动态配置模式 - 中间件可能需要用于日志或追踪)
    if (serverConfig.serverAddress) {
      headers['X-Server-Address'] = serverConfig.serverAddress;
    }
    if (serverConfig.serverId) {
      headers['X-Server-Id'] = serverConfig.serverId;
    }

    // 添加租户会话限制 (tenant-session-limit feature)
    const maxSessions = await this.getTenantMaxSessions(tenantId);
    if (maxSessions > 0) {
      headers['X-Max-Sessions'] = String(maxSessions);
    }

    return headers;
  }

  /**
   * 登录中间件获取 Token
   *
   * @deprecated 此方法将在未来版本中移除。请使用 getAuthHeaders() 方法代替，
   * 该方法使用 Service Token 认证，安全性更高且不需要维护会话状态。
   *
   * @param instanceId 实例 ID
   * @param credentials 可选的登录凭证 (如果未提供，将从数据库获取)
   * @param tenantId 租户 ID (从数据库获取凭证时需要)
   * @param targetServerId MT 服务器 ID (多租户模式)
   * @returns 中间件会话
   */
  async login(
    instanceId: string,
    credentials?: { login: number; password: string },
    tenantId?: string,
    targetServerId?: string,
  ): Promise<MiddlewareSession> {
    // 获取凭证：优先使用传入的凭证，否则从数据库获取
    let loginCredentials = credentials;
    let middlewareUrl = this.baseUrl;

    // 用于传递给中间件的服务器配置（动态配置模式）
    let serverAddress = '';
    let serverId = targetServerId || '';

    // 租户会话限制配置 (tenant-session-limit feature)
    let tenantMaxSessions = 0;

    if (!loginCredentials) {
      if (!tenantId) {
        throw new BusinessException({
          code: ErrorCodes.MIDDLEWARE_500_001,
          message: '获取中间件凭证需要提供租户 ID',
        });
      }

      try {
        // 从数据库获取默认服务器配置
        const serverConfig =
          await this.mtServerService.getDefaultServerConfig(tenantId);
        loginCredentials = {
          login: serverConfig.managerLogin,
          password: serverConfig.managerPassword,
        };
        // 使用服务器配置中的中间件 URL
        middlewareUrl = serverConfig.middlewareUrl;
        // 获取服务器地址和 ID，用于传递给中间件（动态服务器配置）
        serverAddress = serverConfig.serverAddress;
        serverId = serverConfig.serverId;
        this.logger.debug(
          `从数据库获取凭证: 租户=${tenantId}, 服务器=${serverConfig.serverId}, 地址=${serverAddress}`,
        );
      } catch (error) {
        this.logger.error(`获取服务器配置失败: ${tenantId}`, error);
        throw new BusinessException({
          code: ErrorCodes.MIDDLEWARE_500_001,
          message: '获取 MT 服务器配置失败，请检查服务器配置',
        });
      }
    }

    // 获取租户的 maxSessions 配置 (tenant-session-limit feature)
    if (tenantId) {
      try {
        tenantMaxSessions = await this.getTenantMaxSessions(tenantId);
        this.logger.debug(
          `租户 ${tenantId} 的 maxSessions 配置: ${tenantMaxSessions}`,
        );
      } catch (error) {
        this.logger.warn(
          `获取租户 maxSessions 失败: ${tenantId}, 使用默认值 0 (不限制)`,
          error,
        );
      }
    }

    const url = `${middlewareUrl}/api/v1/auth/admin/login`;

    // 构建请求头，包含动态服务器配置
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Instance-ID': instanceId,
    };

    // 如果有服务器地址和 ID，传递给中间件进行动态配置
    if (serverAddress && serverId) {
      headers['X-Server-Address'] = serverAddress;
      headers['X-Server-Id'] = serverId;
      this.logger.debug(
        `传递动态服务器配置给中间件: server_id=${serverId}, address=${serverAddress}`,
      );
    }

    // 传递租户信息给中间件 (tenant-session-limit feature)
    // 中间件将使用这些信息进行会话限制
    if (tenantId) {
      headers['X-Tenant-Id'] = tenantId;
      if (tenantMaxSessions > 0) {
        headers['X-Max-Sessions'] = String(tenantMaxSessions);
      }
      this.logger.debug(
        `传递租户信息给中间件: tenant_id=${tenantId}, max_sessions=${tenantMaxSessions}`,
      );
    }

    try {
      const response = await firstValueFrom(
        this.httpService
          .post<MiddlewareRawResponse<MiddlewareLoginResponse>>(url, {
            login: loginCredentials.login,
            password: loginCredentials.password,
          } as MiddlewareLoginRequest, {
            headers,
          })
          .pipe(
            timeout(this.requestTimeout),
            catchError((error: AxiosError) => {
              this.handleLoginError(error);
              throw error;
            }),
          ),
      );

      // 转换响应
      const loginData = this.responseTransformer.transform(response.data);

      // 创建会话
      const session = this.createSession(instanceId, loginData);

      // 构建缓存键并缓存会话
      const cacheKey = this.buildCacheKey(instanceId, tenantId, serverId);
      this.cacheSession(cacheKey, session);

      this.logger.log(`中间件登录成功: cacheKey=${cacheKey}, serverId=${serverId}`);
      return session;
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      this.logger.error(`中间件登录失败: ${instanceId}`, error);
      throw new BusinessException({
        code: ErrorCodes.MIDDLEWARE_500_001,
        message: '中间件认证失败',
      });
    }
  }

  /**
   * 刷新 Token
   *
   * @param instanceId 实例 ID
   * @returns 更新后的会话
   */
  async refreshToken(instanceId: string): Promise<MiddlewareSession> {
    const cached = this.sessionCache.get(instanceId);
    if (!cached) {
      throw new BusinessException({
        code: ErrorCodes.AUTH_401_002,
        message: '会话不存在，请重新登录',
      });
    }

    const url = `${this.baseUrl}/api/v1/auth/refresh`;

    try {
      const response = await firstValueFrom(
        this.httpService
          .post<MiddlewareRawResponse<MiddlewareLoginResponse>>(
            url,
            {
              refresh_token: cached.session.refreshToken,
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'X-Instance-ID': instanceId,
                Authorization: `Bearer ${cached.session.accessToken}`,
              },
            },
          )
          .pipe(
            timeout(this.requestTimeout),
            catchError((error: AxiosError) => {
              // 刷新失败，清除会话
              this.clearSession(instanceId);
              this.handleLoginError(error);
              throw error;
            }),
          ),
      );

      // 转换响应
      const refreshData = this.responseTransformer.transform(response.data);

      // 更新会话
      const session = this.createSession(instanceId, refreshData);

      // 重新缓存
      this.cacheSession(instanceId, session);

      this.logger.debug(`Token 刷新成功: ${instanceId}`);
      return session;
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      this.logger.error(`Token 刷新失败: ${instanceId}`, error);
      // 清除无效会话
      this.clearSession(instanceId);
      throw new BusinessException({
        code: ErrorCodes.AUTH_401_002,
        message: 'Token 刷新失败，请重新登录',
      });
    }
  }

  /**
   * 清除指定实例的会话
   *
   * @param instanceId 实例 ID
   */
  clearSession(instanceId: string): void {
    const cached = this.sessionCache.get(instanceId);
    if (cached?.refreshTimer) {
      clearTimeout(cached.refreshTimer);
    }
    this.sessionCache.delete(instanceId);
    this.logger.debug(`会话已清除: ${instanceId}`);
  }

  /**
   * 清除所有会话
   */
  clearAllSessions(): void {
    for (const [instanceId, entry] of this.sessionCache.entries()) {
      if (entry.refreshTimer) {
        clearTimeout(entry.refreshTimer);
      }
    }
    this.sessionCache.clear();
    this.logger.debug('所有会话已清除');
  }

  /**
   * 检查会话是否有效
   *
   * @param session 会话信息
   * @returns 是否有效
   */
  isSessionValid(session: MiddlewareSession): boolean {
    // 提前 30 秒视为过期，避免边界情况
    const now = new Date();
    const buffer = 30 * 1000; // 30 秒
    return session.expiresAt.getTime() > now.getTime() + buffer;
  }

  /**
   * 获取缓存的会话数量
   */
  getCacheSize(): number {
    return this.sessionCache.size;
  }

  /**
   * 检查是否有缓存的会话
   *
   * @param instanceId 实例 ID
   * @returns 是否有缓存
   */
  hasSession(instanceId: string): boolean {
    const cached = this.sessionCache.get(instanceId);
    return !!cached && this.isSessionValid(cached.session);
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 创建会话对象
   */
  private createSession(
    instanceId: string,
    loginData: MiddlewareLoginResponse,
  ): MiddlewareSession {
    const expiresAt = new Date(Date.now() + loginData.expires_in * 1000);

    return {
      accessToken: loginData.access_token,
      refreshToken: loginData.refresh_token,
      expiresAt,
      sessionId: loginData.session_id || `session_${Date.now()}`,
      instanceId,
    };
  }

  /**
   * 缓存会话并设置刷新定时器
   */
  private cacheSession(instanceId: string, session: MiddlewareSession): void {
    // 清除旧的定时器
    const oldEntry = this.sessionCache.get(instanceId);
    if (oldEntry?.refreshTimer) {
      clearTimeout(oldEntry.refreshTimer);
    }

    // 计算刷新时间
    const refreshTime =
      session.expiresAt.getTime() - Date.now() - this.refreshBeforeExpiry;

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    // 只有当还有足够时间时才设置刷新定时器
    if (refreshTime > 0) {
      refreshTimer = setTimeout(() => {
        this.autoRefreshToken(instanceId);
      }, refreshTime);
    }

    this.sessionCache.set(instanceId, {
      session,
      refreshTimer,
    });
  }

  /**
   * 自动刷新 Token
   */
  private async autoRefreshToken(instanceId: string): Promise<void> {
    try {
      await this.refreshToken(instanceId);
    } catch (error) {
      this.logger.warn(`自动刷新 Token 失败: ${instanceId}`, error);
      // 刷新失败不抛出异常，下次请求时会重新登录
    }
  }

  /**
   * 处理登录错误
   */
  private handleLoginError(error: AxiosError): never {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as MiddlewareRawResponse<unknown>;

      if (status === 401) {
        throw new BusinessException({
          code: ErrorCodes.AUTH_401_001,
          message: data?.message || '中间件认证失败：用户名或密码错误',
        });
      }

      if (status === 403) {
        throw new BusinessException({
          code: ErrorCodes.AUTH_403_002,
          message: data?.message || '中间件认证失败：权限不足',
        });
      }
    }

    if (error.code === 'ECONNREFUSED') {
      throw new BusinessException({
        code: ErrorCodes.INSTANCE_503_001,
        message: '中间件服务连接被拒绝',
      });
    }

    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      throw new BusinessException({
        code: ErrorCodes.MIDDLEWARE_504_001,
        message: '中间件服务请求超时',
      });
    }

    throw new BusinessException({
      code: ErrorCodes.MIDDLEWARE_500_001,
      message: '中间件认证请求失败',
    });
  }

  /**
   * 获取租户的最大会话数配置 (tenant-session-limit feature)
   * 优先从 MiddlewareInstance 获取，否则从 Tenant 表获取
   *
   * @param tenantId 租户 ID
   * @returns 最大会话数 (0 表示不限制)
   */
  private async getTenantMaxSessions(tenantId: string): Promise<number> {
    // 1. 先尝试从 MiddlewareInstance 获取（租户专属配置）
    const instance = await this.prisma.middlewareInstance.findFirst({
      where: { tenantId },
      select: { maxSessions: true },
    });

    if (instance?.maxSessions) {
      return instance.maxSessions;
    }

    // 2. 回退到 Tenant 表的默认配置
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { maxSessions: true },
    });

    return tenant?.maxSessions || 0;
  }
}
