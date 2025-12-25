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
      serverId?: string; // MT 服务器 ID (用于多租户)
      tenantId?: string; // 租户 ID (用于从数据库获取凭证)
    },
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    // 构建请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Instance-ID': instanceId || '',
    };

    // 添加服务器 ID 头 (用于多租户模式)
    if (options?.serverId) {
      headers['X-Server-Id'] = options.serverId;
    }

    // 添加认证头 (除非明确跳过)
    if (!options?.skipAuth) {
      try {
        if (!options?.tenantId) {
          throw new Error('tenantId 是必需的，Service Token 认证需要租户 ID');
        }
        // 使用 Service Token 认证
        const authHeaders = await this.middlewareAuthService.getAuthHeaders(
          options.tenantId,
          options?.serverId,
        );
        // 合并认证头
        Object.assign(headers, authHeaders);
      } catch (error) {
        this.logger.warn(`获取 Service Token 失败: tenantId=${options?.tenantId}, serverId=${options?.serverId}`, error);
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
    // 使用中间件的 /health 端点获取健康状态
    // 注意：需要直接请求 baseUrl/health，不是 /api/v1/health
    const url = `${this.baseUrl}/health`;

    try {
      const response = await firstValueFrom(
        this.httpService.get<{
          service: string;
          status: string;
          timestamp: number;
          version: string;
        }>(url, {
          headers: {
            'Content-Type': 'application/json',
            'X-Instance-ID': instanceId,
          },
        }).pipe(
          timeout(this.requestTimeout),
          catchError((error: AxiosError) => {
            this.handleAxiosError(error);
            throw error;
          }),
        ),
      );

      const healthData = response.data;

      // 转换中间件健康响应为 ServerStatusDto 格式
      return {
        serverName: healthData.service || 'mt5-middleware',
        connected: healthData.status === 'healthy',
        ping: Date.now() - healthData.timestamp, // 计算延迟
        serverTime: new Date(healthData.timestamp).toISOString(),
        tradeSession: healthData.status === 'healthy' ? 'open' : 'closed',
      };
    } catch (error) {
      // 对于健康检查，所有错误都返回离线状态而不是抛出异常
      // 这样调用者可以优雅地处理中间件不可用的情况
      this.logger.error(`获取中间件健康状态失败: ${instanceId}`, error);
      return {
        serverName: 'mt5-middleware',
        connected: false,
        ping: -1,
        serverTime: new Date().toISOString(),
        tradeSession: 'closed',
      };
    }
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
   * 检查真实的 MT5 连接状态
   * 通过 /health/detailed 端点获取 MT5 组件的实际连接状态
   * @param instanceId 实例 ID
   * @returns { connected: boolean, activeConnections: number, totalSessions: number }
   */
  async checkMt5ConnectionStatus(instanceId: string): Promise<{
    connected: boolean;
    activeConnections: number;
    totalSessions: number;
    message: string;
  }> {
    const url = `${this.baseUrl}/health/detailed`;

    try {
      const response = await firstValueFrom(
        this.httpService.get<{
          status: string;
          components: {
            mt5: {
              status: string;
              message: string;
              pool?: {
                active_connections: number;
                configured_servers: number;
                total_sessions: number;
              };
            };
          };
        }>(url, {
          headers: {
            'Content-Type': 'application/json',
            'X-Instance-ID': instanceId,
          },
        }).pipe(
          timeout(this.requestTimeout),
          catchError((error: AxiosError) => {
            this.handleAxiosError(error);
            throw error;
          }),
        ),
      );

      const healthData = response.data;
      const mt5Component = healthData.components?.mt5;

      if (!mt5Component) {
        return {
          connected: false,
          activeConnections: 0,
          totalSessions: 0,
          message: 'MT5 component not found in health response',
        };
      }

      // 检查 MT5 组件状态和活跃连接数
      // 只有当 MT5 组件健康 AND 有活跃连接时才认为真正连接
      const activeConnections = mt5Component.pool?.active_connections ?? 0;
      const totalSessions = mt5Component.pool?.total_sessions ?? 0;
      const isHealthy = mt5Component.status === 'healthy';

      // MT5 真正连接 = 组件健康 + 有活跃会话或连接
      const isReallyConnected = isHealthy && (activeConnections > 0 || totalSessions > 0);

      return {
        connected: isReallyConnected,
        activeConnections,
        totalSessions,
        message: mt5Component.message,
      };
    } catch (error) {
      this.logger.error(`检查 MT5 连接状态失败: ${instanceId}`, error);
      return {
        connected: false,
        activeConnections: 0,
        totalSessions: 0,
        message: 'Failed to check MT5 connection status',
      };
    }
  }

  /**
   * 测试中间件连接
   * @param instanceId 实例 ID
   */
  async testConnection(instanceId: string): Promise<boolean> {
    const status = await this.getServerStatus(instanceId);
    return status.connected;
  }

  /**
   * 测试中间件 API 认证
   * 尝试获取 Service Token 来验证凭证是否有效
   * @param instanceId 实例 ID
   * @param tenantId 租户 ID (用于从数据库获取凭证)
   */
  async testAuthentication(
    instanceId: string,
    tenantId?: string,
  ): Promise<boolean> {
    try {
      if (!tenantId) {
        return false;
      }
      // 使用 Service Token 认证测试
      await this.middlewareAuthService.getAuthHeaders(tenantId);
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
   * @param serverId MT 服务器 ID (用于多租户模式)
   * @param tenantId 租户 ID (用于从数据库获取凭证)
   */
  async getPositions(
    instanceId: string,
    mt5Login?: string,
    serverId?: string,
    tenantId?: string,
  ): Promise<PositionDto[]> {
    const path = mt5Login
      ? `/api/v1/mt5/positions/${mt5Login}`
      : '/api/v1/account/positions';
    return this.requestWithAuth<PositionDto[]>('get', path, instanceId, { serverId, tenantId });
  }

  /**
   * 批量查询所有用户持仓 (用于 Dashboard 统计)
   * 调用 /api/v1/batch/query-positions 端点获取所有用户的持仓
   * @param instanceId 实例 ID
   * @param serverId MT 服务器 ID (用于多租户模式)
   * @param tenantId 租户 ID (用于从数据库获取凭证)
   * @returns 所有用户的持仓聚合数组
   */
  async getAllPositionsForDashboard(
    instanceId: string,
    serverId?: string,
    tenantId?: string,
  ): Promise<PositionDto[]> {
    // 批量查询响应类型 (匹配中间件实际返回的字段名)
    interface BatchQueryPositionsResponse {
      total: number;
      succeeded: number;
      failed: number;
      results: Array<{
        login: number;
        success: boolean;
        positions?: Array<{
          ticket: number;
          symbol: string;
          type: number; // 中间件返回数字: 0=buy, 1=sell
          volume: number;
          price_open: number; // 中间件使用 price_open
          price_current: number; // 中间件使用 price_current
          sl: number;
          tp: number;
          profit: number;
          swap: number;
          time_create: number; // 中间件使用 time_create (Unix timestamp)
          comment?: string;
          magic?: number;
        }>;
        error?: string;
      }>;
    }

    try {
      const response = await this.requestWithAuth<BatchQueryPositionsResponse>(
        'post',
        '/api/v1/batch/query-positions',
        instanceId,
        {
          serverId,
          tenantId,
          data: {}, // 空 body 获取所有用户
        },
      );

      // 聚合所有用户的持仓
      const allPositions: PositionDto[] = [];
      for (const result of response.results) {
        if (result.success && result.positions) {
          for (const pos of result.positions) {
            allPositions.push({
              ticket: pos.ticket,
              symbol: pos.symbol,
              type: pos.type === 0 ? 'buy' : 'sell', // 转换数字为字符串
              volume: pos.volume,
              openPrice: pos.price_open,
              currentPrice: pos.price_current,
              stopLoss: pos.sl,
              takeProfit: pos.tp,
              profit: pos.profit,
              openTime: pos.time_create ? new Date(pos.time_create * 1000).toISOString() : new Date().toISOString(),
              comment: pos.comment,
              magic: pos.magic,
            });
          }
        }
      }

      this.logger.debug(
        `批量查询持仓完成: 总用户=${response.total}, 成功=${response.succeeded}, 总持仓=${allPositions.length}`,
      );

      return allPositions;
    } catch (error) {
      this.logger.warn(`批量查询持仓失败，回退到单用户查询: ${error.message}`);
      // 回退到原有方法，传递 tenantId 用于从数据库获取凭证
      return this.getPositions(instanceId, undefined, serverId, tenantId);
    }
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
   * @param serverId MT 服务器 ID (用于多租户模式)
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
    serverId?: string,
    tenantId?: string,
  ): Promise<{ deals: DealDto[]; total: number; page: number; page_size: number }> {
    return this.requestWithAuth(
      'get',
      '/api/v1/trading/history/deals',
      instanceId,
      { params, serverId, tenantId },
    );
  }

  /**
   * 获取全部用户的近期交易 (Dashboard 专用)
   * 使用 /api/v1/trading/batch/history 端点 (AdminFilter 保护，管理员可访问)
   * @param instanceId 实例 ID
   * @param limit 限制条数
   * @param serverId MT 服务器 ID (用于多租户模式)
   */
  async getRecentDealsForDashboard(
    instanceId: string,
    limit: number = 10,
    serverId?: string,
    tenantId?: string,
  ): Promise<{ deals: DealDto[]; total: number; page: number; page_size: number }> {
    try {
      // 计算时间范围：最近30天（与中间件默认值一致）
      const now = Math.floor(Date.now() / 1000);
      const from = now - 30 * 24 * 60 * 60;

      // 使用中间件的 "查询所有用户" 模式：发送单个不带 login 的请求
      // 中间件会自动获取所有用户并查询历史
      const requests = [{
        from,
        to: now,
        include_deals: true,
        include_orders: false,
      }];

      // 4. 使用批量历史查询端点
      const response = await this.requestWithAuth<{
        total: number;
        succeeded: number;
        failed: number;
        results: Array<{
          login: number;
          success: boolean;
          deals?: Array<{
            ticket: number;
            symbol: string;
            type: string;
            volume: number;
            price: number;
            profit: number;
            commission: number;
            swap: number;
            time: number;
            comment?: string;
          }>;
        }>;
      }>(
        'post',
        '/api/v1/trading/batch/history',
        instanceId,
        {
          data: { requests },
          serverId,
          tenantId,
        },
      );

      // 合并所有用户的 deals 并按时间排序
      const allDeals: DealDto[] = [];
      for (const result of response.results || []) {
        if (result.success && result.deals) {
          for (const deal of result.deals) {
            // 将 type 转换为字符串 (支持数字和字符串格式：0/"0"=buy, 1/"1"=sell)
            const dealType = String(deal.type);
            const typeStr = dealType === '0' ? 'buy' : dealType === '1' ? 'sell' : dealType;
            allDeals.push({
              ticket: deal.ticket,
              login: result.login, // 添加用户账号
              symbol: deal.symbol,
              type: typeStr,
              volume: deal.volume,
              price: deal.price,
              profit: deal.profit,
              commission: deal.commission || 0,
              swap: deal.swap || 0,
              time: new Date(deal.time * 1000).toISOString(),
              comment: deal.comment,
            });
          }
        }
      }

      // 按时间降序排序
      allDeals.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

      // 如果 limit > 0，取最近的 limit 条；如果 limit <= 0，返回全部
      const recentDeals = limit > 0 ? allDeals.slice(0, limit) : allDeals;

      return {
        deals: recentDeals,
        total: allDeals.length,
        page: 1,
        page_size: limit > 0 ? limit : allDeals.length,
      };
    } catch (error) {
      this.logger.warn(`获取近期交易失败: ${error.message}`);
      return { deals: [], total: 0, page: 1, page_size: limit };
    }
  }

  /**
   * 获取订单历史
   * @param instanceId 实例 ID
   * @param params 查询参数
   * @param serverId MT 服务器 ID (用于多租户模式)
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
    serverId?: string,
    tenantId?: string,
  ): Promise<{ orders: OrderDto[]; total: number; page: number; page_size: number }> {
    return this.requestWithAuth(
      'get',
      '/api/v1/trading/history/orders',
      instanceId,
      { params, serverId, tenantId },
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
  // 用户管理 (管理员端点)
  // ============================================================

  /**
   * 获取用户列表 (管理员端点)
   * 返回所有交易者账户的余额、净值等信息
   * @param instanceId 实例 ID
   * @param params 查询参数
   * @param serverId MT 服务器 ID (多租户模式必需)
   * @param tenantId 租户 ID (用于从数据库获取凭证)
   */
  async getUsers(
    instanceId: string,
    params?: {
      page?: number;
      limit?: number;
      search?: string;
      group?: string;
    },
    serverId?: string,
    tenantId?: string,
  ): Promise<{
    users: Array<{
      login: number;
      name: string;
      group: string;
      balance: number;
      equity: number;
      credit: number;
      margin: number;
      margin_free: number;
      margin_level: number;
      leverage: number;
      is_enabled: boolean;
    }>;
    pagination: {
      total: number;
      page: number;
      pages: number;
      limit: number;
    };
  }> {
    return this.requestWithAuth(
      'get',
      '/api/v1/account/users',
      instanceId,
      { params, serverId, tenantId },
    );
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
