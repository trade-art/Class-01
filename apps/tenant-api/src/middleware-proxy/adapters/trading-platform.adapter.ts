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
  // 交易操作类型
  OpenOrderParams,
  ClosePositionParams,
  ModifyPositionParams,
  PendingOrderParams,
  ModifyOrderParams,
  CancelOrderParams,
  BalanceOperationParams,
  TradeResult,
  // 用户管理类型
  CreateUserParams,
  UpdateUserParams,
  ChangePasswordParams,
  CreateUserResult,
  // 市场数据类型
  CandleData,
  TickData,
  GetCandlesParams,
  GetTicksParams,
  // 批量操作类型
  BatchOpenOrderParams,
  BatchClosePositionParams,
  BatchOperationResult,
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

    // 如果提供了 ServiceToken 配置，自动初始化认证状态
    if (config.serviceToken) {
      this.accessToken = config.serviceToken.token;
      this.tokenExpiry = new Date(config.serviceToken.expiresAt * 1000);
      this.logger.log(
        `使用 ServiceToken 初始化认证，有效期至 ${this.tokenExpiry.toISOString()}`,
      );
    }
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

  /**
   * 检查令牌是否即将过期
   * @param thresholdMinutes 过期阈值（分钟），默认为 5 分钟
   * @returns 如果令牌将在指定时间内过期返回 true
   */
  isTokenExpiring(thresholdMinutes: number = 5): boolean {
    if (!this.accessToken || !this.tokenExpiry) {
      return true; // 没有令牌视为已过期
    }
    const thresholdMs = thresholdMinutes * 60 * 1000;
    return this.tokenExpiry.getTime() < Date.now() + thresholdMs;
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
  // 交易操作方法 (子类实现)
  // ============================================================

  /**
   * 开仓 (市价单)
   */
  abstract openOrder(params: OpenOrderParams): Promise<TradeResult>;

  /**
   * 平仓
   */
  abstract closePosition(params: ClosePositionParams): Promise<TradeResult>;

  /**
   * 修改持仓 (止损/止盈)
   */
  abstract modifyPosition(params: ModifyPositionParams): Promise<TradeResult>;

  /**
   * 挂单
   */
  abstract placePendingOrder(params: PendingOrderParams): Promise<TradeResult>;

  /**
   * 修改挂单
   */
  abstract modifyOrder(params: ModifyOrderParams): Promise<TradeResult>;

  /**
   * 取消挂单
   */
  abstract cancelOrder(params: CancelOrderParams): Promise<TradeResult>;

  /**
   * 余额操作 (入金/出金/信用/调整)
   */
  abstract balanceOperation(params: BalanceOperationParams): Promise<TradeResult>;

  // ============================================================
  // 用户管理方法 (子类实现)
  // ============================================================

  /**
   * 创建用户
   */
  abstract createUser(params: CreateUserParams): Promise<CreateUserResult>;

  /**
   * 更新用户信息
   */
  abstract updateUser(params: UpdateUserParams): Promise<boolean>;

  /**
   * 修改用户密码
   */
  abstract changePassword(params: ChangePasswordParams): Promise<boolean>;

  // ============================================================
  // 市场数据方法 (子类实现)
  // ============================================================

  /**
   * 获取 K 线数据
   */
  abstract getCandles(params: GetCandlesParams): Promise<CandleData[]>;

  /**
   * 获取 Tick 数据
   */
  abstract getTicks(params: GetTicksParams): Promise<TickData[]>;

  // ============================================================
  // 批量操作方法 (子类实现)
  // ============================================================

  /**
   * 批量开仓
   */
  abstract batchOpenOrders(params: BatchOpenOrderParams): Promise<BatchOperationResult>;

  /**
   * 批量平仓
   */
  abstract batchClosePositions(params: BatchClosePositionParams): Promise<BatchOperationResult>;

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

    // 添加认证头信息
    if (!options?.skipAuth) {
      // 优先使用配置中的 authHeaders (ServiceToken 模式)
      if (this.config.authHeaders) {
        Object.assign(headers, this.config.authHeaders);
      } else if (this.accessToken) {
        // 兼容旧的 Bearer Token 模式
        headers['Authorization'] = `Bearer ${this.accessToken}`;
      }
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
      const responseData = error.response.data as Record<string, unknown>;
      const message =
        (responseData as { message?: string })?.message ||
        error.message;

      // 记录完整的中间件响应以便调试
      this.logger.error(`中间件返回错误: status=${status}, response=${JSON.stringify(responseData)}`);

      throw new Error(`HTTP ${status}: ${message}`);
    }

    throw new Error(`Request failed: ${error.message}`);
  }
}
