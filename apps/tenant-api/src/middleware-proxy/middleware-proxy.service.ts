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
   * 执行 HTTP 请求到中间件服务
   * 带有超时、重试和错误处理
   *
   * 公开方法，供其他服务扩展使用
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
   */
  async getServerStatus(instanceId: string): Promise<ServerStatusDto> {
    return this.request<ServerStatusDto>('get', '/server/status', instanceId);
  }

  /**
   * 测试中间件连接
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
   */
  async getAccountInfo(instanceId: string): Promise<AccountInfoDto> {
    return this.request<AccountInfoDto>('get', '/account/info', instanceId);
  }

  /**
   * 获取账户列表
   */
  async getAccounts(instanceId: string): Promise<AccountInfoDto[]> {
    return this.request<AccountInfoDto[]>('get', '/account/list', instanceId);
  }

  // ============================================================
  // 持仓管理
  // ============================================================

  /**
   * 获取所有持仓
   */
  async getPositions(instanceId: string): Promise<PositionDto[]> {
    return this.request<PositionDto[]>('get', '/positions', instanceId);
  }

  /**
   * 获取指定品种持仓
   */
  async getPositionsBySymbol(
    instanceId: string,
    symbol: string,
  ): Promise<PositionDto[]> {
    return this.request<PositionDto[]>('get', `/positions/${symbol}`, instanceId);
  }

  /**
   * 获取单个持仓详情
   */
  async getPositionByTicket(
    instanceId: string,
    ticket: number,
  ): Promise<PositionDto> {
    return this.request<PositionDto>(
      'get',
      `/positions/ticket/${ticket}`,
      instanceId,
    );
  }

  // ============================================================
  // 报价信息
  // ============================================================

  /**
   * 获取所有品种报价
   */
  async getQuotes(instanceId: string): Promise<QuoteDto[]> {
    return this.request<QuoteDto[]>('get', '/quotes', instanceId);
  }

  /**
   * 获取指定品种报价
   */
  async getQuoteBySymbol(instanceId: string, symbol: string): Promise<QuoteDto> {
    return this.request<QuoteDto>('get', `/quotes/${symbol}`, instanceId);
  }

  /**
   * 批量获取品种报价
   */
  async getQuotesBySymbols(
    instanceId: string,
    symbols: string[],
  ): Promise<QuoteDto[]> {
    return this.request<QuoteDto[]>('post', '/quotes/batch', instanceId, {
      data: { symbols },
    });
  }

  // ============================================================
  // 品种信息
  // ============================================================

  /**
   * 获取所有交易品种
   */
  async getSymbols(instanceId: string): Promise<SymbolDto[]> {
    return this.request<SymbolDto[]>('get', '/symbols', instanceId);
  }

  /**
   * 获取品种详情
   */
  async getSymbolInfo(instanceId: string, symbol: string): Promise<SymbolDto> {
    return this.request<SymbolDto>('get', `/symbols/${symbol}`, instanceId);
  }

  // ============================================================
  // 交易历史
  // ============================================================

  /**
   * 获取交易历史
   */
  async getDeals(
    instanceId: string,
    params?: {
      from?: string;
      to?: string;
      symbol?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ deals: DealDto[]; total: number }> {
    return this.request<{ deals: DealDto[]; total: number }>(
      'get',
      '/history/deals',
      instanceId,
      { params },
    );
  }

  /**
   * 获取订单历史
   */
  async getOrders(
    instanceId: string,
    params?: {
      from?: string;
      to?: string;
      symbol?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ orders: OrderDto[]; total: number }> {
    return this.request<{ orders: OrderDto[]; total: number }>(
      'get',
      '/history/orders',
      instanceId,
      { params },
    );
  }

  // ============================================================
  // 统计数据
  // ============================================================

  /**
   * 获取账户统计摘要
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
    return this.request('get', '/account/summary', instanceId);
  }

  /**
   * 获取持仓统计
   */
  async getPositionsSummary(
    instanceId: string,
  ): Promise<{
    totalPositions: number;
    totalVolume: number;
    totalProfit: number;
    bySymbol: { symbol: string; count: number; profit: number }[];
  }> {
    return this.request('get', '/positions/summary', instanceId);
  }
}
