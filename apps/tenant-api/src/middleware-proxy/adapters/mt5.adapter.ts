import { HttpService } from '@nestjs/axios';
import { TradingPlatformAdapter } from './trading-platform.adapter';
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
  PositionType,
  OrderType,
  OrderState,
  DealType,
  DealEntry,
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

// ============================================================
// MT5 原始响应类型
// ============================================================

interface MT5Response<T> {
  code: number;
  data: T;
  message?: string;
  timestamp?: number;
}

/**
 * 中间件统一响应格式 (UsersController 等使用)
 * { success: true, data: {...} } 或 { success: false, error: {...} }
 */
interface MiddlewareUnifiedResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  timestamp?: number;
}

/**
 * 中间件简化健康检查响应格式
 * 中间件 /api/v1/health 端点返回此格式
 */
interface MiddlewareHealthResponse {
  service: string;
  status: string;
  timestamp: number;
  version: string;
}

interface MT5UserRaw {
  login: number;
  name: string;
  group: string;
  email?: string;
  balance: number;
  equity: number;
  margin: number;
  margin_free: number;
  margin_level: number;
  leverage: number;
  credit?: number;
  registration?: string;
  last_access?: string;
  comment?: string;
  status?: string;
}

interface MT5PositionRaw {
  ticket: number;
  login: number;
  symbol: string;
  type: number;
  volume: number;
  open_price: number;
  current_price: number;
  open_time: string;
  profit: number;
  swap: number;
  commission?: number;
  sl?: number;
  tp?: number;
  comment?: string;
  magic?: number;
}

interface MT5OrderRaw {
  ticket: number;
  login: number;
  symbol: string;
  type: number;
  volume: number;
  price: number;
  price_open?: number;
  price_current?: number;
  sl?: number;
  tp?: number;
  time_setup: string;
  time_done?: string;
  state: number;
  comment?: string;
  magic?: number;
}

interface MT5DealRaw {
  ticket: number;
  login: number;
  symbol: string;
  type: number;
  entry: number | string; // 中间件返回字符串 "in"/"out"/"inout"/"unknown"
  volume: number;
  price: number;
  profit: number;
  storage?: number; // 中间件使用 storage 而不是 swap
  swap?: number; // 兼容旧格式
  commission: number;
  time: number | string; // 中间件返回 Unix 时间戳 (number)
  order?: number;
  position_id?: number;
  comment?: string;
  magic?: number;
}

interface MT5SymbolRaw {
  symbol: string;
  description: string;
  path?: string;
  digits: number;
  contract_size: number;
  tick_size: number;
  tick_value?: number;
  spread: number;
  bid: number;
  ask: number;
  high?: number;
  low?: number;
  volume_min: number;
  volume_max: number;
  volume_step: number;
  currency?: string;
  profit_currency?: string;
  margin_currency?: string;
  trade_mode?: number;
  enabled?: boolean;
}

interface MT5QuoteRaw {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  time: string;
  high?: number;
  low?: number;
  volume?: number;
}

// ============================================================
// 交易操作响应类型
// ============================================================

interface MT5TradeResultRaw {
  retcode: number;
  ticket?: number;
  volume?: number;
  price?: number;
  message?: string;
}

interface MT5CreateUserResultRaw {
  login: number;
  message?: string;
}

// ============================================================
// 市场数据响应类型
// ============================================================

interface MT5CandleRaw {
  time: number; // Unix 时间戳
  open: number;
  high: number;
  low: number;
  close: number;
  tick_volume: number;
  volume?: number;
  spread?: number;
}

interface MT5TickRaw {
  symbol: string;
  time: number; // Unix 时间戳
  bid: number;
  ask: number;
  last?: number;
  volume?: number;
  flags?: number;
}

/**
 * MT5 平台适配器
 * 实现与 MT5 中间件的通信
 */
export class MT5Adapter extends TradingPlatformAdapter {
  readonly platformType = PlatformType.MT5;

  constructor(httpService: HttpService, config: AdapterConfig) {
    super(httpService, config);
  }

  // ============================================================
  // 认证方法
  // ============================================================

  // 保存认证时的服务器连接状态
  private serverConnected = false;

  /**
   * 认证适配器
   *
   * 在 ServiceToken 模式下，认证已在构造函数中通过 config.serviceToken 完成，
   * 此方法为无操作 (no-op)。
   *
   * @param _managerLogin 管理员登录号 (ServiceToken 模式下忽略)
   * @param _managerPassword 管理员密码 (ServiceToken 模式下忽略)
   * @returns 当前访问令牌
   */
  async authenticate(
    _managerLogin: number,
    _managerPassword: string,
  ): Promise<string> {
    // 如果已通过 ServiceToken 初始化认证，直接返回
    if (this.config.serviceToken && this.accessToken) {
      this.logger.debug('使用 ServiceToken 模式，跳过传统认证流程');
      // 假设 ServiceToken 模式下服务器已连接
      this.serverConnected = true;
      return this.accessToken;
    }

    // 如果配置了 authHeaders，说明使用 ServiceToken 模式但 token 在 headers 中
    if (this.config.authHeaders) {
      this.logger.debug('使用 authHeaders 模式，跳过传统认证流程');
      this.serverConnected = true;
      // 返回一个占位符，实际认证通过 authHeaders 完成
      return 'service-token-auth';
    }

    // 旧的登录端点已弃用，如果没有配置 ServiceToken，抛出错误
    throw new Error(
      '传统登录认证模式已弃用。请使用 ServiceToken 认证模式。' +
      '确保在创建适配器时提供 config.serviceToken 或 config.authHeaders。',
    );
  }

  async refreshToken(): Promise<string> {
    // ServiceToken 模式下，令牌刷新由调用者负责（重新生成新的 ServiceToken）
    // 适配器层只返回当前令牌
    if (this.config.serviceToken && this.accessToken) {
      this.logger.debug('ServiceToken 模式，返回当前令牌');
      return this.accessToken;
    }

    // authHeaders 模式下也跳过 HTTP 刷新
    if (this.config.authHeaders) {
      this.logger.debug('authHeaders 模式，返回当前令牌');
      return this.accessToken || 'service-token-auth';
    }

    const response = await this.request<
      MT5Response<{ access_token: string; expires_in: number }>
    >('post', '/api/v1/auth/refresh', {
      skipAuth: false,
    });

    if (response.code !== 0) {
      throw new Error(response.message || 'Token refresh failed');
    }

    this.accessToken = response.data.access_token;
    this.tokenExpiry = new Date(Date.now() + response.data.expires_in * 1000);

    return this.accessToken;
  }

  // ============================================================
  // 响应格式处理辅助方法
  // ============================================================

  /**
   * 统一处理中间件响应格式
   * 支持两种格式:
   * 1. MT5Response: { code: 0, data: {...} }
   * 2. MiddlewareUnifiedResponse: { success: true, data: {...} }
   */
  private extractResponseData<T>(
    response: MT5Response<T> | MiddlewareUnifiedResponse<T>,
    errorMessage = 'Request failed',
  ): T {
    if ('success' in response) {
      // MiddlewareUnifiedResponse 格式
      if (!response.success || response.data === undefined) {
        throw new Error(response.error?.message || errorMessage);
      }
      return response.data;
    } else {
      // MT5Response 格式
      if (response.code !== 0) {
        throw new Error(response.message || errorMessage);
      }
      return response.data;
    }
  }

  /**
   * 检查响应是否成功（不提取数据）
   */
  private isResponseSuccess<T>(
    response: MT5Response<T> | MiddlewareUnifiedResponse<T>,
  ): boolean {
    if ('success' in response) {
      return response.success === true;
    }
    return response.code === 0;
  }

  // ============================================================
  // 用户管理
  // ============================================================

  async getUsers(
    params?: GetUsersParams,
  ): Promise<PaginatedResult<TradingUser>> {
    const queryParams: Record<string, unknown> = {};

    if (params?.page) queryParams.page = params.page;
    if (params?.pageSize) queryParams.limit = params.pageSize;
    if (params?.search) queryParams.keyword = params.search; // 中间件使用 keyword 参数
    if (params?.group) queryParams.group = params.group;
    if (params?.sortBy) queryParams.sortBy = params.sortBy;
    if (params?.sortOrder) queryParams.sortOrder = params.sortOrder;

    // 中间件 UsersController 返回 { success: true, data: { users: [...], pagination: {...} } }
    // 需要兼容两种响应格式
    type UsersResponseData = {
      users: MT5UserRaw[];
      pagination?: { total: number; page: number; limit: number; pages: number };
      total?: number; // 兼容旧格式
    };

    const response = await this.request<
      | MT5Response<UsersResponseData>
      | MiddlewareUnifiedResponse<UsersResponseData>
    >('get', '/api/v1/account/users', { params: queryParams });

    // 检查响应格式并提取数据
    let usersData: UsersResponseData;

    if ('success' in response) {
      // MiddlewareUnifiedResponse 格式
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to get users');
      }
      usersData = response.data;
    } else {
      // MT5Response 格式
      if (response.code !== 0) {
        throw new Error(response.message || 'Failed to get users');
      }
      usersData = response.data;
    }

    const page = params?.page || 1;
    const pageSize = params?.pageSize || 20;
    // 优先使用 pagination.total，其次是 total 字段
    const total = usersData.pagination?.total ?? usersData.total ?? 0;

    return {
      items: usersData.users.map(this.transformUser),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };
  }

  async getUser(login: number): Promise<TradingUser | null> {
    try {
      const response = await this.request<
        MT5Response<MT5UserRaw> | MiddlewareUnifiedResponse<MT5UserRaw>
      >('get', `/api/v1/account/users/${login}`);

      const userData = this.extractResponseData(response, 'Failed to get user');
      return this.transformUser(userData);
    } catch {
      return null;
    }
  }

  async updateUserGroup(login: number, newGroup: string): Promise<boolean> {
    const response = await this.request<
      MT5Response<unknown> | MiddlewareUnifiedResponse<unknown>
    >('put', `/api/v1/account/users/${login}/group`, {
      data: { group: newGroup },
    });

    return this.isResponseSuccess(response);
  }

  // ============================================================
  // 持仓管理
  // ============================================================

  async getPositions(params?: GetPositionsParams): Promise<TradingPosition[]> {
    // 外部 API 访问（使用 Manager Token）必须提供 login 参数
    // 因为 /api/v1/account/positions 需要 JWT 中的用户 login，而 Manager Token 没有此信息
    if (!params?.login) {
      // 使用批量查询端点获取所有持仓（无需 login 参数的替代方案）
      // 但这需要提供 logins 数组，所以如果没有 login 参数，抛出错误
      throw new Error(
        'Login parameter is required for external API access. Use /positions?login=XXX to specify the user.',
      );
    }

    // 使用管理员端点: /api/v1/account/users/{login}/positions
    // 此端点通过 URL 路径传递 login，无需 JWT 中的用户 login
    const path = `/api/v1/account/users/${params.login}/positions`;

    // 中间件返回格式: { positions: MT5PositionRaw[], total: number }
    type UserPositionsResponse = {
      positions: MT5PositionRaw[];
      total: number;
    };

    const response = await this.request<
      MT5Response<UserPositionsResponse> | MiddlewareUnifiedResponse<UserPositionsResponse>
    >('get', path);

    const positionsData = this.extractResponseData(
      response,
      'Failed to get positions',
    );

    // 从 { positions: [...], total: N } 结构中提取 positions 数组
    const positionsArray = positionsData.positions || [];
    let positions = positionsArray.map(this.transformPosition);

    if (params?.symbol) {
      positions = positions.filter((p) => p.symbol === params.symbol);
    }

    return positions;
  }

  async getUserPositions(login: number): Promise<TradingPosition[]> {
    return this.getPositions({ login });
  }

  // ============================================================
  // 订单管理
  // ============================================================

  async getOrders(params?: GetOrdersParams): Promise<TradingOrder[]> {
    // 外部 API 访问（使用 Manager Token）必须提供 login 参数
    // 因为 /api/v1/account/orders 需要 JWT 中的用户 login，而 Manager Token 没有此信息
    if (!params?.login) {
      throw new Error(
        'Login parameter is required for external API access. Use /orders?login=XXX to specify the user.',
      );
    }

    // 使用批量查询端点: POST /api/v1/batch/query-orders
    // 此端点通过请求体传递 login，无需 JWT 中的用户 login
    const path = '/api/v1/batch/query-orders';
    const requestBody = {
      queries: [
        {
          login: params.login,
          symbol: params.symbol || '',
        },
      ],
    };

    type BatchOrderResult = {
      login: number;
      orders: MT5OrderRaw[];
    };
    type BatchOrdersResponse = {
      total: number;
      results: BatchOrderResult[];
    };

    const response = await this.request<
      MT5Response<BatchOrdersResponse> | MiddlewareUnifiedResponse<BatchOrdersResponse>
    >('post', path, { data: requestBody });

    const batchData = this.extractResponseData(
      response,
      'Failed to get orders',
    );

    // 从批量查询结果中提取订单
    const ordersData: MT5OrderRaw[] = [];
    if (batchData.results && Array.isArray(batchData.results)) {
      for (const result of batchData.results) {
        if (result.orders && Array.isArray(result.orders)) {
          ordersData.push(...result.orders);
        }
      }
    }

    let orders = ordersData.map(this.transformOrder);

    if (params?.state !== undefined) {
      orders = orders.filter((o) => o.state === params.state);
    }

    return orders;
  }

  async getUserOrders(login: number): Promise<TradingOrder[]> {
    return this.getOrders({ login });
  }

  // ============================================================
  // 成交记录
  // ============================================================

  async getDeals(params?: GetDealsParams): Promise<PaginatedResult<TradingDeal>> {
    const queryParams: Record<string, unknown> = {};

    if (params?.login) queryParams.login = params.login;
    if (params?.symbol) queryParams.symbol = params.symbol;
    // 中间件期望 Unix 时间戳 (秒)，而不是 ISO 字符串
    if (params?.from) queryParams.from = Math.floor(params.from.getTime() / 1000);
    if (params?.to) queryParams.to = Math.floor(params.to.getTime() / 1000);
    if (params?.page) queryParams.page = params.page;
    if (params?.pageSize) queryParams.limit = params.pageSize;

    type DealsResponseData = { deals: MT5DealRaw[]; total: number };

    // 正确的中间件端点: /api/v1/trading/history/deals
    const response = await this.request<
      MT5Response<DealsResponseData> | MiddlewareUnifiedResponse<DealsResponseData>
    >('get', '/api/v1/trading/history/deals', { params: queryParams });

    const dealsData = this.extractResponseData(response, 'Failed to get deals');

    const page = params?.page || 1;
    const pageSize = params?.pageSize || 50;

    return {
      items: dealsData.deals.map(this.transformDeal),
      total: dealsData.total,
      page,
      pageSize,
      hasMore: page * pageSize < dealsData.total,
    };
  }

  async getUserDeals(
    login: number,
    from?: Date,
    to?: Date,
  ): Promise<TradingDeal[]> {
    const result = await this.getDeals({
      login,
      from,
      to,
      pageSize: 1000, // 获取足够多的记录
    });

    return result.items;
  }

  // ============================================================
  // 品种和报价
  // ============================================================

  async getSymbols(params?: GetSymbolsParams): Promise<TradingSymbol[]> {
    let path = '/api/v1/symbols';

    if (params?.group) {
      path = `/api/v1/symbols/group/${params.group}`;
    }

    // 中间件返回格式: { symbols: MT5SymbolRaw[], count: number }
    type SymbolsResponseData = {
      symbols: MT5SymbolRaw[];
      count: number;
    };

    const response = await this.request<
      | MT5Response<SymbolsResponseData>
      | MiddlewareUnifiedResponse<SymbolsResponseData>
    >('get', path);

    const responseData = this.extractResponseData(
      response,
      'Failed to get symbols',
    );

    // 从 { symbols: [...], count: N } 结构中提取 symbols 数组
    const symbolsArray = responseData.symbols || [];

    let symbols = symbolsArray.map(this.transformSymbol);

    if (params?.search) {
      const search = params.search.toLowerCase();
      symbols = symbols.filter(
        (s) =>
          s.symbol.toLowerCase().includes(search) ||
          s.description.toLowerCase().includes(search),
      );
    }

    return symbols;
  }

  async getSymbol(symbol: string): Promise<TradingSymbol | null> {
    try {
      const response = await this.request<
        MT5Response<MT5SymbolRaw> | MiddlewareUnifiedResponse<MT5SymbolRaw>
      >('get', `/api/v1/symbols/${symbol}`);

      const symbolData = this.extractResponseData(
        response,
        'Failed to get symbol',
      );
      return this.transformSymbol(symbolData);
    } catch {
      return null;
    }
  }

  async getQuote(symbol: string): Promise<TradingQuote | null> {
    try {
      const response = await this.request<
        MT5Response<MT5QuoteRaw> | MiddlewareUnifiedResponse<MT5QuoteRaw>
      >('get', `/api/v1/symbols/${symbol}/quote`);

      const quoteData = this.extractResponseData(
        response,
        'Failed to get quote',
      );
      return this.transformQuote(quoteData);
    } catch {
      return null;
    }
  }

  async getQuotes(symbols: string[]): Promise<TradingQuote[]> {
    const response = await this.request<
      MT5Response<MT5QuoteRaw[]> | MiddlewareUnifiedResponse<MT5QuoteRaw[]>
    >('post', '/api/v1/quotes', {
      data: { symbols },
    });

    const quotesData = this.extractResponseData(
      response,
      'Failed to get quotes',
    );

    return quotesData.map(this.transformQuote);
  }

  // ============================================================
  // 服务器状态
  // ============================================================

  async getServerStatus(): Promise<ServerStatus> {
    // 中间件健康端点可能返回两种格式：
    // 1. MT5Response 格式: {code: 0, data: {...}}
    // 2. 简化格式: {service, status, timestamp, version}
    const response = await this.request<
      | MT5Response<{
          status: string;
          server_time: string;
          version?: string;
          connected_users?: number;
          active_positions?: number;
        }>
      | MiddlewareHealthResponse
    >('get', '/api/v1/health', { skipAuth: true });

    // 检查是否是简化的 MiddlewareHealthResponse 格式
    if ('service' in response && 'status' in response) {
      const healthResponse = response as MiddlewareHealthResponse;
      return {
        online: healthResponse.status === 'healthy',
        serverTime: new Date(healthResponse.timestamp),
        version: healthResponse.version,
        connectedUsers: undefined,
        activePositions: undefined,
      };
    }

    // 标准 MT5Response 格式
    const mt5Response = response as MT5Response<{
      status: string;
      server_time: string;
      version?: string;
      connected_users?: number;
      active_positions?: number;
    }>;

    if (mt5Response.code !== 0 || !mt5Response.data) {
      throw new Error(mt5Response.message || 'Failed to get server status');
    }

    return {
      online: mt5Response.data.status === 'healthy',
      serverTime: new Date(mt5Response.data.server_time),
      version: mt5Response.data.version,
      connectedUsers: mt5Response.data.connected_users,
      activePositions: mt5Response.data.active_positions,
    };
  }

  async testConnection(): Promise<boolean> {
    // 真正测试与中间件的连接，调用健康检查端点
    try {
      const status = await this.getServerStatus();
      this.serverConnected = status.online;
      return status.online;
    } catch (error) {
      this.logger.warn(
        `连接测试失败: ${error instanceof Error ? error.message : '未知错误'}`,
      );
      this.serverConnected = false;
      return false;
    }
  }

  // ============================================================
  // 数据转换方法
  // ============================================================

  private transformUser = (raw: MT5UserRaw): TradingUser => ({
    login: raw.login,
    name: raw.name,
    group: raw.group,
    email: raw.email,
    balance: raw.balance,
    equity: raw.equity,
    margin: raw.margin,
    marginFree: raw.margin_free,
    marginLevel: raw.margin_level,
    leverage: raw.leverage,
    credit: raw.credit,
    registration: raw.registration ? new Date(raw.registration) : undefined,
    lastAccess: raw.last_access ? new Date(raw.last_access) : undefined,
    comment: raw.comment,
    status: raw.status,
  });

  private transformPosition = (raw: MT5PositionRaw): TradingPosition => ({
    ticket: raw.ticket,
    login: raw.login,
    symbol: raw.symbol,
    type: raw.type as PositionType,
    volume: raw.volume,
    openPrice: raw.open_price,
    currentPrice: raw.current_price,
    openTime: new Date(raw.open_time),
    profit: raw.profit,
    swap: raw.swap,
    commission: raw.commission,
    sl: raw.sl,
    tp: raw.tp,
    comment: raw.comment,
    magic: raw.magic,
  });

  private transformOrder = (raw: MT5OrderRaw): TradingOrder => ({
    ticket: raw.ticket,
    login: raw.login,
    symbol: raw.symbol,
    type: raw.type as OrderType,
    volume: raw.volume,
    price: raw.price,
    priceOpen: raw.price_open,
    priceCurrent: raw.price_current,
    sl: raw.sl,
    tp: raw.tp,
    timeSetup: new Date(raw.time_setup),
    timeDone: raw.time_done ? new Date(raw.time_done) : undefined,
    state: raw.state as OrderState,
    comment: raw.comment,
    magic: raw.magic,
  });

  private transformDeal = (raw: MT5DealRaw): TradingDeal => {
    // 处理 entry 字段：中间件返回字符串，需要转换为数字
    let entry: DealEntry;
    if (typeof raw.entry === 'string') {
      const entryMap: Record<string, DealEntry> = {
        in: DealEntry.IN,
        out: DealEntry.OUT,
        inout: DealEntry.INOUT,
        unknown: DealEntry.IN, // 默认值
      };
      entry = entryMap[raw.entry] ?? DealEntry.IN;
    } else {
      entry = raw.entry as DealEntry;
    }

    // 处理 time 字段：中间件返回 Unix 时间戳 (number)
    const time =
      typeof raw.time === 'number'
        ? new Date(raw.time * 1000)
        : new Date(raw.time);

    // 使用 storage (中间件) 或 swap (兼容旧格式)
    const swap = raw.storage ?? raw.swap ?? 0;

    return {
      ticket: raw.ticket,
      login: raw.login,
      symbol: raw.symbol,
      type: raw.type as DealType,
      entry,
      volume: raw.volume,
      price: raw.price,
      profit: raw.profit,
      swap,
      commission: raw.commission,
      time,
      order: raw.order,
      positionId: raw.position_id,
      comment: raw.comment,
      magic: raw.magic,
    };
  };

  private transformSymbol = (raw: MT5SymbolRaw): TradingSymbol => ({
    symbol: raw.symbol,
    description: raw.description,
    path: raw.path,
    digits: raw.digits,
    contractSize: raw.contract_size,
    tickSize: raw.tick_size,
    tickValue: raw.tick_value,
    spread: raw.spread,
    bid: raw.bid,
    ask: raw.ask,
    high: raw.high,
    low: raw.low,
    volumeMin: raw.volume_min,
    volumeMax: raw.volume_max,
    volumeStep: raw.volume_step,
    currency: raw.currency,
    profitCurrency: raw.profit_currency,
    marginCurrency: raw.margin_currency,
    tradeMode: raw.trade_mode,
    enabled: raw.enabled,
  });

  private transformQuote = (raw: MT5QuoteRaw): TradingQuote => ({
    symbol: raw.symbol,
    bid: raw.bid,
    ask: raw.ask,
    spread: raw.spread,
    time: new Date(raw.time),
    high: raw.high,
    low: raw.low,
    volume: raw.volume,
  });

  // ============================================================
  // 交易操作方法实现
  // ============================================================

  /**
   * 开仓 (市价单)
   * 中间件端点: POST /api/v1/trading/orders/open
   */
  async openOrder(params: OpenOrderParams): Promise<TradeResult> {
    const response = await this.request<MT5Response<MT5TradeResultRaw> | MiddlewareUnifiedResponse<MT5TradeResultRaw>>(
      'post',
      '/api/v1/trading/orders/open',
      {
        data: {
          login: params.login,
          symbol: params.symbol,
          type: params.type,
          volume: params.volume,
          price: params.price,
          sl: params.sl,
          tp: params.tp,
          deviation: params.deviation,
          comment: params.comment,
          magic: params.magic,
        },
      },
    );

    return this.transformTradeResult(response);
  }

  /**
   * 平仓
   * 中间件端点: POST /api/v1/trading/positions/{ticket}/close
   */
  async closePosition(params: ClosePositionParams): Promise<TradeResult> {
    const response = await this.request<MT5Response<MT5TradeResultRaw> | MiddlewareUnifiedResponse<MT5TradeResultRaw>>(
      'post',
      `/api/v1/trading/positions/${params.ticket}/close`,
      {
        data: {
          login: params.login,
          volume: params.volume,
          price: params.price,
          deviation: params.deviation,
          comment: params.comment,
        },
      },
    );

    return this.transformTradeResult(response);
  }

  /**
   * 修改持仓 (止损/止盈)
   * 中间件端点: PUT /api/v1/trading/positions/{ticket}
   */
  async modifyPosition(params: ModifyPositionParams): Promise<TradeResult> {
    const response = await this.request<MT5Response<MT5TradeResultRaw> | MiddlewareUnifiedResponse<MT5TradeResultRaw>>(
      'put',
      `/api/v1/trading/positions/${params.ticket}`,
      {
        data: {
          login: params.login,
          sl: params.sl,
          tp: params.tp,
        },
      },
    );

    return this.transformTradeResult(response);
  }

  /**
   * 挂单
   * 中间件端点: POST /api/v1/trading/orders/pending
   */
  async placePendingOrder(params: PendingOrderParams): Promise<TradeResult> {
    const response = await this.request<MT5Response<MT5TradeResultRaw> | MiddlewareUnifiedResponse<MT5TradeResultRaw>>(
      'post',
      '/api/v1/trading/orders/pending',
      {
        data: {
          login: params.login,
          symbol: params.symbol,
          type: params.type,
          volume: params.volume,
          price: params.price,
          sl: params.sl,
          tp: params.tp,
          expiration: params.expiration
            ? Math.floor(params.expiration.getTime() / 1000)
            : undefined,
          comment: params.comment,
          magic: params.magic,
        },
      },
    );

    return this.transformTradeResult(response);
  }

  /**
   * 修改挂单
   * 中间件端点: PUT /api/v1/trading/orders/{ticket}
   */
  async modifyOrder(params: ModifyOrderParams): Promise<TradeResult> {
    const response = await this.request<MT5Response<MT5TradeResultRaw> | MiddlewareUnifiedResponse<MT5TradeResultRaw>>(
      'put',
      `/api/v1/trading/orders/${params.ticket}`,
      {
        data: {
          login: params.login,
          price: params.price,
          sl: params.sl,
          tp: params.tp,
          expiration: params.expiration
            ? Math.floor(params.expiration.getTime() / 1000)
            : undefined,
        },
      },
    );

    return this.transformTradeResult(response);
  }

  /**
   * 取消挂单
   * 中间件端点: DELETE /api/v1/trading/orders/{ticket}
   */
  async cancelOrder(params: CancelOrderParams): Promise<TradeResult> {
    const response = await this.request<MT5Response<MT5TradeResultRaw> | MiddlewareUnifiedResponse<MT5TradeResultRaw>>(
      'delete',
      `/api/v1/trading/orders/${params.ticket}`,
      {
        data: {
          login: params.login,
        },
      },
    );

    return this.transformTradeResult(response);
  }

  /**
   * 余额操作 (入金/出金/信用/调整)
   * 中间件端点: POST /api/v1/trading/balance
   */
  async balanceOperation(params: BalanceOperationParams): Promise<TradeResult> {
    const response = await this.request<MT5Response<MT5TradeResultRaw> | MiddlewareUnifiedResponse<MT5TradeResultRaw>>(
      'post',
      '/api/v1/trading/balance',
      {
        data: {
          login: params.login,
          type: params.type,
          amount: params.amount,
          comment: params.comment,
        },
      },
    );

    return this.transformTradeResult(response);
  }

  // ============================================================
  // 用户管理方法实现
  // ============================================================

  /**
   * 创建用户
   * 中间件端点: POST /api/v1/account/users
   */
  async createUser(params: CreateUserParams): Promise<CreateUserResult> {
    try {
      const response = await this.request<
        | MT5Response<MT5CreateUserResultRaw>
        | MiddlewareUnifiedResponse<MT5CreateUserResultRaw>
      >('post', '/api/v1/account/users', {
        data: {
          name: params.name,
          group: params.group,
          password: params.password,
          investor_password: params.investorPassword,
          email: params.email,
          phone: params.phone,
          leverage: params.leverage,
          comment: params.comment,
          agent: params.agent,
          balance: params.balance,
        },
      });

      if (!this.isResponseSuccess(response)) {
        const errorMsg =
          'success' in response
            ? response.error?.message
            : (response as MT5Response<MT5CreateUserResultRaw>).message;
        return {
          success: false,
          message: errorMsg || 'Failed to create user',
        };
      }

      const data = this.extractResponseData(response, 'Failed to create user');
      return {
        success: true,
        login: data.login,
        message: data.message,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message,
      };
    }
  }

  /**
   * 更新用户信息
   * 中间件端点: PUT /api/v1/account/users/{login}
   */
  async updateUser(params: UpdateUserParams): Promise<boolean> {
    const response = await this.request<
      MT5Response<unknown> | MiddlewareUnifiedResponse<unknown>
    >('put', `/api/v1/account/users/${params.login}`, {
      data: {
        name: params.name,
        group: params.group,
        email: params.email,
        phone: params.phone,
        leverage: params.leverage,
        comment: params.comment,
        agent: params.agent,
      },
    });

    return this.isResponseSuccess(response);
  }

  /**
   * 修改用户密码
   * 中间件端点: PUT /api/v1/account/users/{login}/password
   */
  async changePassword(params: ChangePasswordParams): Promise<boolean> {
    const response = await this.request<
      MT5Response<unknown> | MiddlewareUnifiedResponse<unknown>
    >('put', `/api/v1/account/users/${params.login}/password`, {
      data: {
        password: params.password,
        type: params.type,
      },
    });

    return this.isResponseSuccess(response);
  }

  // ============================================================
  // 市场数据方法实现
  // ============================================================

  /**
   * 获取 K 线数据
   * 中间件端点: GET /api/v1/market/candles
   */
  async getCandles(params: GetCandlesParams): Promise<CandleData[]> {
    const queryParams: Record<string, unknown> = {
      symbol: params.symbol,
      timeframe: params.timeframe,
    };

    if (params.from) {
      queryParams.from = Math.floor(params.from.getTime() / 1000);
    }
    if (params.to) {
      queryParams.to = Math.floor(params.to.getTime() / 1000);
    }
    if (params.count) {
      queryParams.count = params.count;
    }

    const response = await this.request<
      MT5Response<MT5CandleRaw[]> | MiddlewareUnifiedResponse<MT5CandleRaw[]>
    >('get', '/api/v1/market/candles', { params: queryParams });

    const candlesData = this.extractResponseData(
      response,
      'Failed to get candles',
    );

    return candlesData.map(this.transformCandle);
  }

  /**
   * 获取 Tick 数据
   * 中间件端点: GET /api/v1/market/ticks
   */
  async getTicks(params: GetTicksParams): Promise<TickData[]> {
    const queryParams: Record<string, unknown> = {
      symbol: params.symbol,
    };

    if (params.from) {
      queryParams.from = Math.floor(params.from.getTime() / 1000);
    }
    if (params.to) {
      queryParams.to = Math.floor(params.to.getTime() / 1000);
    }
    if (params.count) {
      queryParams.count = params.count;
    }

    const response = await this.request<
      MT5Response<MT5TickRaw[]> | MiddlewareUnifiedResponse<MT5TickRaw[]>
    >('get', '/api/v1/market/ticks', { params: queryParams });

    const ticksData = this.extractResponseData(response, 'Failed to get ticks');

    return ticksData.map(this.transformTick);
  }

  // ============================================================
  // 批量操作方法实现
  // ============================================================

  /**
   * 批量开仓
   * 中间件端点: POST /api/v1/trading/batch/open
   */
  async batchOpenOrders(
    params: BatchOpenOrderParams,
  ): Promise<BatchOperationResult> {
    type BatchResultData = {
      total: number;
      success: number;
      failed: number;
      results: MT5TradeResultRaw[];
    };

    const response = await this.request<
      MT5Response<BatchResultData> | MiddlewareUnifiedResponse<BatchResultData>
    >('post', '/api/v1/trading/batch/open', {
      data: {
        orders: params.orders.map((order) => ({
          login: order.login,
          symbol: order.symbol,
          type: order.type,
          volume: order.volume,
          price: order.price,
          sl: order.sl,
          tp: order.tp,
          deviation: order.deviation,
          comment: order.comment,
          magic: order.magic,
        })),
      },
    });

    const batchData = this.extractResponseData(
      response,
      'Failed to execute batch open',
    );

    return {
      total: batchData.total,
      success: batchData.success,
      failed: batchData.failed,
      results: batchData.results.map((r) => ({
        success: r.retcode === 0 || r.retcode === 10009,
        ticket: r.ticket,
        retcode: r.retcode,
        message: r.message,
        volume: r.volume,
        price: r.price,
      })),
    };
  }

  /**
   * 批量平仓
   * 中间件端点: POST /api/v1/trading/batch/close
   */
  async batchClosePositions(
    params: BatchClosePositionParams,
  ): Promise<BatchOperationResult> {
    type BatchResultData = {
      total: number;
      success: number;
      failed: number;
      results: MT5TradeResultRaw[];
    };

    const response = await this.request<
      MT5Response<BatchResultData> | MiddlewareUnifiedResponse<BatchResultData>
    >('post', '/api/v1/trading/batch/close', {
      data: {
        positions: params.positions.map((pos) => ({
          login: pos.login,
          ticket: pos.ticket,
          volume: pos.volume,
          price: pos.price,
          deviation: pos.deviation,
          comment: pos.comment,
        })),
      },
    });

    const batchData = this.extractResponseData(
      response,
      'Failed to execute batch close',
    );

    return {
      total: batchData.total,
      success: batchData.success,
      failed: batchData.failed,
      results: batchData.results.map((r) => ({
        success: r.retcode === 0 || r.retcode === 10009,
        ticket: r.ticket,
        retcode: r.retcode,
        message: r.message,
        volume: r.volume,
        price: r.price,
      })),
    };
  }

  // ============================================================
  // 交易/市场数据转换方法
  // ============================================================

  private transformTradeResult(
    response:
      | MT5Response<MT5TradeResultRaw>
      | MiddlewareUnifiedResponse<MT5TradeResultRaw>,
  ): TradeResult {
    // 首先检查响应是否成功并提取数据
    let responseSuccess: boolean;
    let resultData: MT5TradeResultRaw | undefined;
    let errorMessage: string | undefined;

    if ('success' in response) {
      // MiddlewareUnifiedResponse 格式
      responseSuccess = response.success;
      resultData = response.data;
      errorMessage = response.error?.message;
    } else {
      // MT5Response 格式
      responseSuccess = response.code === 0;
      resultData = response.data;
      errorMessage = response.message;
    }

    // 如果没有数据，返回失败结果
    if (!resultData) {
      return {
        success: false,
        ticket: 0,
        retcode: -1,
        message: errorMessage || 'No data in response',
        volume: 0,
        price: 0,
      };
    }

    // MT5 返回码 10009 表示成功 (TRADE_RETCODE_DONE)
    // 返回码 0 也可能表示成功
    const success =
      responseSuccess &&
      (resultData.retcode === 0 || resultData.retcode === 10009);

    return {
      success,
      ticket: resultData.ticket,
      retcode: resultData.retcode,
      message: resultData.message || errorMessage,
      volume: resultData.volume,
      price: resultData.price,
    };
  }

  private transformCandle = (raw: MT5CandleRaw): CandleData => ({
    time: new Date(raw.time * 1000),
    open: raw.open,
    high: raw.high,
    low: raw.low,
    close: raw.close,
    tickVolume: raw.tick_volume,
    volume: raw.volume,
    spread: raw.spread,
  });

  private transformTick = (raw: MT5TickRaw): TickData => ({
    symbol: raw.symbol,
    time: new Date(raw.time * 1000),
    bid: raw.bid,
    ask: raw.ask,
    last: raw.last,
    volume: raw.volume,
    flags: raw.flags,
  });
}
