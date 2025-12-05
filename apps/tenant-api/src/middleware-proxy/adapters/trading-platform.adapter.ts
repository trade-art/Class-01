import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, retry, catchError } from 'rxjs';
import { AxiosError, AxiosRequestConfig } from 'axios';
import {
  PlatformType,
  TradingUser,
  TradingPosition,
  TradingOrder,
  TradingDeal,
  TradingSymbol,
  TradingQuote,
  PaginatedResult,
  GetUsersParams,
  GetPositionsParams,
  GetOrdersParams,
  GetDealsParams,
  GetSymbolsParams,
  ServerStatus,
  AdapterConfig,
} from './types';

/**
 * 交易平台适配器抽象基类
 * 定义所有 MT 平台必须实现的接口
 */
export abstract class TradingPlatformAdapter {
  protected readonly logger: Logger;
  protected readonly config: AdapterConfig;
  protected accessToken?: string;
  protected tokenExpiry?: Date;

  abstract readonly platformType: PlatformType;

  constructor(
    protected readonly httpService: HttpService,
    config: AdapterConfig,
  ) {
    this.config = {
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      ...config,
    };
    this.logger = new Logger(this.constructor.name);
  }

  // ============================================================
  // 认证方法 (子类实现)
  // ============================================================

  /**
   * 获取访问令牌
   * 不同平台可能有不同的认证方式
   */
  abstract authenticate(
    managerLogin: number,
    managerPassword: string,
  ): Promise<string>;

  /**
   * 刷新访问令牌
   */
  abstract refreshToken(): Promise<string>;

  /**
   * 检查令牌是否有效
   */
  protected isTokenValid(): boolean {
    if (!this.accessToken || !this.tokenExpiry) {
      return false;
    }
    // 提前 60 秒刷新令牌
    return this.tokenExpiry.getTime() > Date.now() + 60000;
  }

  /**
   * 检查适配器是否已认证
   * 公开方法，供外部服务检查认证状态
   */
  isAuthenticated(): boolean {
    return this.isTokenValid();
  }

  // ============================================================
  // 用户管理方法 (子类实现)
  // ============================================================

  /**
   * 获取用户列表
   */
  abstract getUsers(
    params?: GetUsersParams,
  ): Promise<PaginatedResult<TradingUser>>;

  /**
   * 获取单个用户
   */
  abstract getUser(login: number): Promise<TradingUser | null>;

  /**
   * 更新用户组
   */
  abstract updateUserGroup(login: number, newGroup: string): Promise<boolean>;

  // ============================================================
  // 持仓管理方法 (子类实现)
  // ============================================================

  /**
   * 获取持仓列表
   */
  abstract getPositions(
    params?: GetPositionsParams,
  ): Promise<TradingPosition[]>;

  /**
   * 获取指定用户的持仓
   */
  abstract getUserPositions(login: number): Promise<TradingPosition[]>;

  // ============================================================
  // 订单管理方法 (子类实现)
  // ============================================================

  /**
   * 获取订单列表
   */
  abstract getOrders(params?: GetOrdersParams): Promise<TradingOrder[]>;

  /**
   * 获取指定用户的订单
   */
  abstract getUserOrders(login: number): Promise<TradingOrder[]>;

  // ============================================================
  // 成交记录方法 (子类实现)
  // ============================================================

  /**
   * 获取成交记录
   */
  abstract getDeals(
    params?: GetDealsParams,
  ): Promise<PaginatedResult<TradingDeal>>;

  /**
   * 获取指定用户的成交记录
   */
  abstract getUserDeals(
    login: number,
    from?: Date,
    to?: Date,
  ): Promise<TradingDeal[]>;

  // ============================================================
  // 品种和报价方法 (子类实现)
  // ============================================================

  /**
   * 获取交易品种列表
   */
  abstract getSymbols(params?: GetSymbolsParams): Promise<TradingSymbol[]>;

  /**
   * 获取单个品种信息
   */
  abstract getSymbol(symbol: string): Promise<TradingSymbol | null>;

  /**
   * 获取实时报价
   */
  abstract getQuote(symbol: string): Promise<TradingQuote | null>;

  /**
   * 批量获取实时报价
   */
  abstract getQuotes(symbols: string[]): Promise<TradingQuote[]>;

  // ============================================================
  // 服务器状态方法 (子类实现)
  // ============================================================

  /**
   * 获取服务器状态
   */
  abstract getServerStatus(): Promise<ServerStatus>;

  /**
   * 测试连接
   */
  abstract testConnection(): Promise<boolean>;

  // ============================================================
  // HTTP 请求工具方法 (基类实现)
  // ============================================================

  /**
   * 执行 HTTP 请求
   */
  protected async request<T>(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    options?: {
      data?: Record<string, unknown>;
      params?: Record<string, unknown>;
      headers?: Record<string, string>;
      skipAuth?: boolean;
    },
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    // 添加认证令牌
    if (!options?.skipAuth && this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const config: AxiosRequestConfig = {
      method,
      url,
      headers,
      params: options?.params,
      data: options?.data,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.request<T>(config).pipe(
          timeout(this.config.timeout!),
          retry({
            count: this.config.retryAttempts!,
            delay: this.config.retryDelay!,
          }),
          catchError((error: AxiosError) => {
            this.handleError(error);
            throw error;
          }),
        ),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Request failed: ${method.toUpperCase()} ${path}`, error);
      throw error;
    }
  }

  /**
   * 处理 HTTP 错误
   */
  protected handleError(error: AxiosError): void {
    if (error.code === 'ECONNREFUSED') {
      throw new Error(`Connection refused: ${this.config.baseUrl}`);
    }

    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      throw new Error(`Request timeout: ${this.config.baseUrl}`);
    }

    if (error.response) {
      const status = error.response.status;
      const message =
        (error.response.data as { message?: string })?.message ||
        error.message;

      throw new Error(`HTTP ${status}: ${message}`);
    }

    throw new Error(`Request failed: ${error.message}`);
  }
}
