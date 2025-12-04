import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, retry, catchError } from 'rxjs';
import { AxiosError, AxiosRequestConfig } from 'axios';
import {
  MiddlewareResponse,
  AccountInfoDto,
  PositionDto,
  QuoteDto,
  SymbolDto,
  DealDto,
  OrderDto,
  ServerStatusDto,
} from './dto';
import { BusinessException, ErrorCodes } from '../common';
import { ResponseTransformer, MiddlewareRawResponse } from './transformers';
import { MiddlewareAuthService } from './services';

/**
 * 中间件代理服务
 * 负责与 MT5 中间件服务通信，提供缓存和重试机制
 */
@Injectable()
export class MiddlewareProxyService implements OnModuleInit {
  private readonly logger = new Logger(MiddlewareProxyService.name);
  private readonly baseUrl: string;
  private readonly requestTimeout: number;
  private readonly retryAttempts: number;
  private readonly retryDelay: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly responseTransformer: ResponseTransformer,
    private readonly middlewareAuthService: MiddlewareAuthService,
  ) {
    this.baseUrl = this.configService.get<string>('middleware.baseUrl')!;
    this.requestTimeout = this.configService.get<number>('middleware.timeout')!;
    this.retryAttempts = this.configService.get<number>(
      'middleware.retryAttempts',
    )!;
    this.retryDelay = this.configService.get<number>('middleware.retryDelay')!;
  }

  async onModuleInit() {
    this.logger.log(`中间件代理服务初始化，目标: ${this.baseUrl}`);
    // 可选：启动时测试连接
    // await this.testConnection();
  }

  /**
   * 执行 HTTP 请求到中间件服务 (旧版本，保持向后兼容)
   * 带有超时、重试和错误处理
   *
   * @deprecated 请使用 requestWithAuth 方法
   */
  async request<T>(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    instanceId: string,
    options?: {
      data?: Record<string, unknown>;
      params?: Record<string, unknown>;
    },
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const config: AxiosRequestConfig = {
      method,
      url,
      headers: {
        'Content-Type': 'application/json',
        'X-Instance-ID': instanceId,
      },
      params: options?.params,
      data: options?.data,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.request<MiddlewareResponse<T>>(config).pipe(
          timeout(this.requestTimeout),
          retry({
            count: this.retryAttempts,
            delay: this.retryDelay,
          }),
          catchError((error: AxiosError) => {
            this.handleAxiosError(error);
            throw error;
          }),
        ),
      );

      const result = response.data;

      if (!result.success) {
        throw new BusinessException({
          code: ErrorCodes.MIDDLEWARE_500_002,
          message: result.message || '中间件请求失败',
        });
      }

      return result.data as T;
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      this.logger.error(`中间件请求失败: ${path}`, error);
      throw new ServiceUnavailableException('中间件服务不可用');
    }
  }

  /**
   * 执行带认证的 HTTP 请求到中间件服务
   * 自动处理认证、响应转换和错误处理
   *
   * @param method HTTP 方法
   * @param path API 路径 (不含 baseUrl)
   * @param instanceId 实例 ID
   * @param options 可选参数
   * @returns 转换后的响应数据
   */
  async requestWithAuth<T>(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    instanceId: string,
    options?: {
      data?: Record<string, unknown>;
      params?: Record<string, unknown>;
      skipAuth?: boolean; // 跳过认证 (用于健康检查等公开端点)
    },
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    // 构建请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Instance-ID': instanceId,
    };

    // 添加认证头 (除非明确跳过)
    if (!options?.skipAuth) {
      try {
        const accessToken =
          await this.middlewareAuthService.getAccessToken(instanceId);
        headers['Authorization'] = `Bearer ${accessToken}`;
      } catch (error) {
        this.logger.warn(`获取中间件认证令牌失败: ${instanceId}`, error);
        // 认证失败时继续请求，让中间件返回 401 错误
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
        this.httpService.request<MiddlewareRawResponse<T>>(config).pipe(
          timeout(this.requestTimeout),
          retry({
            count: this.retryAttempts,
            delay: this.retryDelay,
          }),
          catchError((error: AxiosError) => {
            this.handleAxiosError(error);
            throw error;
          }),
        ),
      );

      // 使用 ResponseTransformer 转换响应
      return this.responseTransformer.transform(response.data);
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      this.logger.error(`中间件请求失败: ${path}`, error);
      throw new ServiceUnavailableException('中间件服务不可用');
    }
  }

  /**
   * 获取中间件认证服务实例
   * 用于外部服务需要直接操作认证时
   */
  getAuthService(): MiddlewareAuthService {
    return this.middlewareAuthService;
  }

  /**
   * 获取响应转换器实例
   * 用于外部服务需要直接转换响应时
   */
  getResponseTransformer(): ResponseTransformer {
    return this.responseTransformer;
  }

  /**
   * 处理 Axios 错误
   */
  private handleAxiosError(error: AxiosError): never {
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

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as MiddlewareResponse;

      if (status === 404) {
        throw new BusinessException({
          code: ErrorCodes.NOT_FOUND_404_001,
          message: data?.message || '资源不存在',
        });
      }

      if (status === 401 || status === 403) {
        throw new BusinessException({
          code: ErrorCodes.MIDDLEWARE_500_002,
          message: data?.message || '中间件认证失败',
        });
      }

      throw new BusinessException({
        code: ErrorCodes.MIDDLEWARE_500_002,
        message: data?.message || '中间件请求失败',
      });
    }

    throw new BusinessException({
      code: ErrorCodes.INSTANCE_503_001,
      message: '中间件服务不可用',
    });
  }

  // ============================================================
  // 服务器状态
  // ============================================================

  /**
   * 获取服务器状态
   * @param instanceId 实例 ID
   */
  async getServerStatus(instanceId: string): Promise<ServerStatusDto> {
    return this.requestWithAuth<ServerStatusDto>(
      'get',
      '/api/v1/health',
      instanceId,
      { skipAuth: true }, // 健康检查端点不需要认证
    );
  }

  /**
   * 获取服务器详细健康状态
   * @param instanceId 实例 ID
   */
  async getServerHealthDetailed(instanceId: string): Promise<unknown> {
    return this.requestWithAuth(
      'get',
      '/api/v1/health/detailed',
      instanceId,
      { skipAuth: true },
    );
  }

  /**
   * 测试中间件连接
   * @param instanceId 实例 ID
   */
  async testConnection(instanceId: string): Promise<boolean> {
    try {
      await this.getServerStatus(instanceId);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================
  // 账户信息
  // ============================================================

  /**
   * 获取账户信息
   * @param instanceId 实例 ID
   * @param mt5Login MT5 账号 (可选，不传则获取当前认证账户信息)
   */
  async getAccountInfo(
    instanceId: string,
    mt5Login?: string,
  ): Promise<AccountInfoDto> {
    const path = mt5Login
      ? `/api/v1/mt5/account/${mt5Login}`
      : '/api/v1/account/info';
    return this.requestWithAuth<AccountInfoDto>('get', path, instanceId);
  }

  /**
   * 获取账户余额
   * @param instanceId 实例 ID
   * @param mt5Login MT5 账号
   */
  async getAccountBalance(
    instanceId: string,
    mt5Login: string,
  ): Promise<{ balance: number; equity: number; margin: number; freeMargin: number }> {
    return this.requestWithAuth('get', `/api/v1/mt5/balance/${mt5Login}`, instanceId);
  }

  // ============================================================
  // 持仓管理
  // ============================================================

  /**
   * 获取所有持仓
   * @param instanceId 实例 ID
   * @param mt5Login MT5 账号 (可选，不传则获取当前认证账户持仓)
   */
  async getPositions(
    instanceId: string,
    mt5Login?: string,
  ): Promise<PositionDto[]> {
    const path = mt5Login
      ? `/api/v1/mt5/positions/${mt5Login}`
      : '/api/v1/account/positions';
    return this.requestWithAuth<PositionDto[]>('get', path, instanceId);
  }

  /**
   * 获取指定品种持仓
   * @param instanceId 实例 ID
   * @param symbol 交易品种
   * @param mt5Login MT5 账号 (可选)
   */
  async getPositionsBySymbol(
    instanceId: string,
    symbol: string,
    mt5Login?: string,
  ): Promise<PositionDto[]> {
    // 先获取所有持仓，再按品种过滤
    const positions = await this.getPositions(instanceId, mt5Login);
    return positions.filter((p) => p.symbol === symbol);
  }

  /**
   * 获取单个持仓详情
   * @param instanceId 实例 ID
   * @param ticket 持仓票号
   */
  async getPositionByTicket(
    instanceId: string,
    ticket: number,
  ): Promise<PositionDto | null> {
    // 中间件可能没有单独获取持仓的端点，从列表中筛选
    const positions = await this.getPositions(instanceId);
    return positions.find((p) => p.ticket === ticket) || null;
  }

  // ============================================================
  // 报价信息
  // ============================================================

  /**
   * 获取指定品种报价
   * @param instanceId 实例 ID
   * @param symbol 交易品种
   */
  async getQuote(instanceId: string, symbol: string): Promise<QuoteDto> {
    return this.requestWithAuth<QuoteDto>(
      'get',
      `/api/v1/symbols/${symbol}/quote`,
      instanceId,
    );
  }

  /**
   * 批量获取品种报价
   * @param instanceId 实例 ID
   * @param symbols 品种列表
   */
  async getQuotes(instanceId: string, symbols: string[]): Promise<QuoteDto[]> {
    return this.requestWithAuth<QuoteDto[]>('post', '/api/v1/quotes', instanceId, {
      data: { symbols },
    });
  }

  /**
   * 获取所有品种的报价
   * 先获取品种列表，再批量获取报价
   * @param instanceId 实例 ID
   */
  async getAllQuotes(instanceId: string): Promise<QuoteDto[]> {
    const symbols = await this.getSymbols(instanceId);
    const symbolNames = symbols.map((s) => s.symbol);
    if (symbolNames.length === 0) {
      return [];
    }
    return this.getQuotes(instanceId, symbolNames);
  }

  /**
   * 获取指定品种报价 (别名，保持向后兼容)
   * @deprecated 请使用 getQuote
   */
  async getQuoteBySymbol(instanceId: string, symbol: string): Promise<QuoteDto> {
    return this.getQuote(instanceId, symbol);
  }

  /**
   * 批量获取品种报价 (别名，保持向后兼容)
   * @deprecated 请使用 getQuotes
   */
  async getQuotesBySymbols(
    instanceId: string,
    symbols: string[],
  ): Promise<QuoteDto[]> {
    return this.getQuotes(instanceId, symbols);
  }

  // ============================================================
  // 品种信息
  // ============================================================

  /**
   * 获取所有交易品种
   * @param instanceId 实例 ID
   */
  async getSymbols(instanceId: string): Promise<SymbolDto[]> {
    return this.requestWithAuth<SymbolDto[]>('get', '/api/v1/symbols', instanceId);
  }

  /**
   * 获取品种详情
   * @param instanceId 实例 ID
   * @param symbol 品种名称
   */
  async getSymbolInfo(instanceId: string, symbol: string): Promise<SymbolDto> {
    return this.requestWithAuth<SymbolDto>(
      'get',
      `/api/v1/symbols/${symbol}`,
      instanceId,
    );
  }

  /**
   * 获取品种分组列表
   * @param instanceId 实例 ID
   */
  async getSymbolGroups(instanceId: string): Promise<string[]> {
    return this.requestWithAuth<string[]>(
      'get',
      '/api/v1/symbols/groups',
      instanceId,
    );
  }

  /**
   * 按分组获取品种
   * @param instanceId 实例 ID
   * @param group 分组名称
   */
  async getSymbolsByGroup(
    instanceId: string,
    group: string,
  ): Promise<SymbolDto[]> {
    return this.requestWithAuth<SymbolDto[]>(
      'get',
      `/api/v1/symbols/group/${group}`,
      instanceId,
    );
  }

  // ============================================================
  // 交易历史
  // ============================================================

  /**
   * 获取成交历史
   * @param instanceId 实例 ID
   * @param params 查询参数
   */
  async getDeals(
    instanceId: string,
    params?: {
      from?: string;
      to?: string;
      symbol?: string;
      page?: number;
      page_size?: number;
    },
  ): Promise<{ deals: DealDto[]; total: number; page: number; page_size: number }> {
    return this.requestWithAuth(
      'get',
      '/api/v1/trading/history/deals',
      instanceId,
      { params },
    );
  }

  /**
   * 获取订单历史
   * @param instanceId 实例 ID
   * @param params 查询参数
   */
  async getOrders(
    instanceId: string,
    params?: {
      from?: string;
      to?: string;
      symbol?: string;
      page?: number;
      page_size?: number;
    },
  ): Promise<{ orders: OrderDto[]; total: number; page: number; page_size: number }> {
    return this.requestWithAuth(
      'get',
      '/api/v1/trading/history/orders',
      instanceId,
      { params },
    );
  }

  /**
   * 获取当前挂单
   * @param instanceId 实例 ID
   */
  async getPendingOrders(instanceId: string): Promise<OrderDto[]> {
    return this.requestWithAuth<OrderDto[]>(
      'get',
      '/api/v1/account/orders',
      instanceId,
    );
  }

  /**
   * 获取账户历史 (综合历史)
   * @param instanceId 实例 ID
   * @param limit 限制条数
   */
  async getAccountHistory(
    instanceId: string,
    limit: number = 100,
  ): Promise<unknown[]> {
    return this.requestWithAuth(
      'get',
      '/api/v1/account/history',
      instanceId,
      { params: { limit } },
    );
  }

  // ============================================================
  // 统计数据
  // ============================================================

  /**
   * 获取账户统计摘要
   * 聚合账户信息和持仓统计
   * @param instanceId 实例 ID
   */
  async getAccountSummary(
    instanceId: string,
  ): Promise<{
    totalBalance: number;
    totalEquity: number;
    totalProfit: number;
    positionsCount: number;
    ordersCount: number;
  }> {
    // 聚合账户信息和持仓数据
    const [accountInfo, positions, pendingOrders] = await Promise.all([
      this.getAccountInfo(instanceId),
      this.getPositions(instanceId),
      this.getPendingOrders(instanceId).catch(() => [] as OrderDto[]),
    ]);

    const totalProfit = positions.reduce((sum, p) => sum + (p.profit || 0), 0);

    return {
      totalBalance: accountInfo.balance || 0,
      totalEquity: accountInfo.equity || 0,
      totalProfit,
      positionsCount: positions.length,
      ordersCount: pendingOrders.length,
    };
  }

  /**
   * 获取持仓统计
   * @param instanceId 实例 ID
   */
  async getPositionsSummary(
    instanceId: string,
  ): Promise<{
    totalPositions: number;
    totalVolume: number;
    totalProfit: number;
    bySymbol: { symbol: string; count: number; profit: number; volume: number }[];
  }> {
    const positions = await this.getPositions(instanceId);

    // 按品种分组统计
    const bySymbolMap = new Map<
      string,
      { count: number; profit: number; volume: number }
    >();

    for (const pos of positions) {
      const existing = bySymbolMap.get(pos.symbol) || {
        count: 0,
        profit: 0,
        volume: 0,
      };
      bySymbolMap.set(pos.symbol, {
        count: existing.count + 1,
        profit: existing.profit + (pos.profit || 0),
        volume: existing.volume + (pos.volume || 0),
      });
    }

    const bySymbol = Array.from(bySymbolMap.entries()).map(([symbol, stats]) => ({
      symbol,
      ...stats,
    }));

    return {
      totalPositions: positions.length,
      totalVolume: positions.reduce((sum, p) => sum + (p.volume || 0), 0),
      totalProfit: positions.reduce((sum, p) => sum + (p.profit || 0), 0),
      bySymbol,
    };
  }

  // ============================================================
  // K线数据
  // ============================================================

  /**
   * 获取 K 线数据
   * @param instanceId 实例 ID
   * @param symbol 交易品种
   * @param params 查询参数
   */
  async getCandles(
    instanceId: string,
    symbol: string,
    params?: {
      timeframe?: string; // M1, M5, M15, M30, H1, H4, D1, W1, MN
      limit?: number;
      from?: string;
      to?: string;
    },
  ): Promise<unknown[]> {
    return this.requestWithAuth(
      'get',
      `/api/v1/market/candles/${symbol}`,
      instanceId,
      { params },
    );
  }

  /**
   * 获取最新 K 线
   * @param instanceId 实例 ID
   * @param symbol 交易品种
   * @param timeframe 时间周期
   */
  async getLatestCandle(
    instanceId: string,
    symbol: string,
    timeframe: string = 'M1',
  ): Promise<unknown> {
    return this.requestWithAuth(
      'get',
      `/api/v1/market/candles/${symbol}/latest`,
      instanceId,
      { params: { timeframe } },
    );
  }
}
