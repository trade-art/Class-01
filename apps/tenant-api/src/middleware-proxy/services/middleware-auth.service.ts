import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { AxiosError } from 'axios';
import { BusinessException, ErrorCodes } from '../../common';
import {
  ResponseTransformer,
  MiddlewareRawResponse,
} from '../transformers/response.transformer';

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
  username: string;
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
   * Key: instanceId
   * Value: CacheEntry (session + refresh timer)
   */
  private readonly sessionCache = new Map<string, CacheEntry>();

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
   * @param credentials 可选的登录凭证 (如果未提供，将从配置获取)
   * @returns 中间件会话
   */
  async getSession(
    instanceId: string,
    credentials?: { username: string; password: string },
  ): Promise<MiddlewareSession> {
    // 检查缓存
    const cached = this.sessionCache.get(instanceId);
    if (cached && this.isSessionValid(cached.session)) {
      return cached.session;
    }

    // 会话不存在或已过期，需要登录
    this.logger.debug(`会话不存在或已过期，重新登录: ${instanceId}`);
    return this.login(instanceId, credentials);
  }

  /**
   * 获取访问令牌
   * 便捷方法，直接返回 access token
   *
   * @param instanceId 实例 ID
   * @param credentials 可选的登录凭证
   * @returns 访问令牌
   */
  async getAccessToken(
    instanceId: string,
    credentials?: { username: string; password: string },
  ): Promise<string> {
    const session = await this.getSession(instanceId, credentials);
    return session.accessToken;
  }

  /**
   * 登录中间件获取 Token
   *
   * @param instanceId 实例 ID
   * @param credentials 登录凭证
   * @returns 中间件会话
   */
  async login(
    instanceId: string,
    credentials?: { username: string; password: string },
  ): Promise<MiddlewareSession> {
    // 获取凭证
    const loginCredentials = credentials || this.getDefaultCredentials();

    const url = `${this.baseUrl}/api/v1/auth/admin/login`;

    try {
      const response = await firstValueFrom(
        this.httpService
          .post<MiddlewareRawResponse<MiddlewareLoginResponse>>(url, {
            username: loginCredentials.username,
            password: loginCredentials.password,
          } as MiddlewareLoginRequest, {
            headers: {
              'Content-Type': 'application/json',
              'X-Instance-ID': instanceId,
            },
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

      // 缓存会话并设置刷新定时器
      this.cacheSession(instanceId, session);

      this.logger.log(`中间件登录成功: ${instanceId}`);
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
   * 获取默认登录凭证
   */
  private getDefaultCredentials(): { username: string; password: string } {
    const username = this.configService.get<string>('middleware.adminUsername');
    const password = this.configService.get<string>('middleware.adminPassword');

    if (!username || !password) {
      throw new BusinessException({
        code: ErrorCodes.MIDDLEWARE_500_001,
        message: '未配置中间件管理员凭证',
      });
    }

    return { username, password };
  }

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
}
