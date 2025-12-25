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
// MT4 原始响应类型
// ============================================================

interface MT4Response<T> {
  code: number;
  data: T;
  message?: string;
  error?: string;
  timestamp?: number;
}

/**
 * MT4 用户原始数据
 * MT4 的用户结构与 MT5 略有不同
 */
interface MT4UserRaw {
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
  regdate?: string; // MT4 使用 regdate 而非 registration
  lastdate?: string; // MT4 使用 lastdate 而非 last_access
  comment?: string;
  enable?: number; // MT4 使用数字表示状态
  readonly?: number;
  agent_account?: number;
}

/**
 * MT4 订单/持仓原始数据
 * MT4 的订单和持仓使用同一个结构
 * 通过 cmd 字段区分订单类型：0-5 为市场单/挂单，6=余额操作，7=信用操作
 */
interface MT4OrderRaw {
  ticket: number;
  login: number;
  symbol: string;
  cmd: number; // MT4 使用 cmd 而非 type
  volume: number; // 以手数表示 (0.01 = 1000 units)
  open_price: number;
  close_price?: number;
  open_time: string;
  close_time?: string;
  expiration?: string;
  profit: number;
  swap: number;
  commission: number;
  sl?: number;
  tp?: number;
  comment?: string;
  magic?: number;
  state?: string; // MT4 订单状态
}

/**
 * MT4 历史订单（已关闭）
 */
interface MT4HistoryOrderRaw {
  ticket: number;
  login: number;
  symbol: string;
  cmd: number;
  volume: number;
  open_price: number;
  close_price: number;
  open_time: string;
  close_time: string;
  profit: number;
  swap: number;
  commission: number;
  sl?: number;
  tp?: number;
  comment?: string;
  magic?: number;
}

/**
 * MT4 品种原始数据
 */
interface MT4SymbolRaw {
  symbol: string;
  description: string;
  digits: number;
  contract_size: number;
  point: number; // MT4 使用 point 而非 tick_size
  spread: number;
  bid: number;
  ask: number;
  high?: number;
  low?: number;
  lot_min: number; // MT4 使用 lot_min 而非 volume_min
  lot_max: number;
  lot_step: number;
  currency?: string;
  margin_currency?: string;
  trade_mode?: number;
  enabled?: boolean;
}

/**
 * MT4 报价原始数据
 */
interface MT4QuoteRaw {
  symbol: string;
  bid: number;
  ask: number;
  spread?: number;
  time: string;
  high?: number;
  low?: number;
}

/**
 * MT4 交易结果原始数据
 */
interface MT4TradeResultRaw {
  retcode: number;
  ticket?: number;
  order?: number;
  volume?: number;
  price?: number;
  message?: string;
  comment?: string;
}

/**
 * MT4 创建用户结果原始数据
 */
interface MT4CreateUserResultRaw {
  login: number;
  message?: string;
}

/**
 * MT4 K线原始数据
 */
interface MT4CandleRaw {
  time: number; // Unix timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  tick_volume: number;
  volume?: number;
  spread?: number;
}

/**
 * MT4 Tick 原始数据
 */
interface MT4TickRaw {
  time: number; // Unix timestamp (毫秒)
  bid: number;
  ask: number;
  last?: number;
  volume?: number;
  flags?: number;
}

/**
 * MT4 平台适配器
 * 实现与 MT4 中间件的通信
 *
 * MT4 与 MT5 的主要差异：
 * 1. MT4 使用 cmd 字段表示订单类型 (0=Buy, 1=Sell, 2-5=挂单)
 * 2. MT4 的订单和持仓没有明确分离
 * 3. MT4 没有 BUY_STOP_LIMIT 和 SELL_STOP_LIMIT 订单类型
 * 4. MT4 使用不同的字段命名 (regdate, lastdate, cmd, point, lot_*)
 */
export class MT4Adapter extends TradingPlatformAdapter {
  readonly platformType = PlatformType.MT4;

  constructor(httpService: HttpService, config: AdapterConfig) {
    super(httpService, config);
  }

  // ============================================================
  // 认证方法
  // ============================================================

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
      return this.accessToken;
    }

    // 如果配置了 authHeaders，说明使用 ServiceToken 模式但 token 在 headers 中
    if (this.config.authHeaders) {
      this.logger.debug('使用 authHeaders 模式，跳过传统认证流程');
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
      MT4Response<{ access_token: string; expires_in: number }>
    >('post', '/api/v1/auth/refresh', {
      skipAuth: false,
    });

    if (response.code !== 0) {
      throw new Error(response.message || response.error || 'Token refresh failed');
    }

    this.accessToken = response.data.access_token;
    this.tokenExpiry = new Date(Date.now() + response.data.expires_in * 1000);

    return this.accessToken;
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
    if (params?.search) queryParams.search = params.search;
    if (params?.group) queryParams.group = params.group;
    if (params?.sortBy) queryParams.sortBy = params.sortBy;
    if (params?.sortOrder) queryParams.sortOrder = params.sortOrder;

    const response = await this.request<
      MT4Response<{ users: MT4UserRaw[]; total: number }>
    >('get', '/api/v1/account/users', { params: queryParams });

    if (response.code !== 0) {
      throw new Error(response.message || 'Failed to get users');
    }

    const page = params?.page || 1;
    const pageSize = params?.pageSize || 20;

    return {
      items: response.data.users.map(this.transformUser),
      total: response.data.total,
      page,
      pageSize,
      hasMore: page * pageSize < response.data.total,
    };
  }

  async getUser(login: number): Promise<TradingUser | null> {
    try {
      const response = await this.request<MT4Response<MT4UserRaw>>(
        'get',
        `/api/v1/account/users/${login}`,
      );

      if (response.code !== 0) {
        return null;
      }

      return this.transformUser(response.data);
    } catch {
      return null;
    }
  }

  async updateUserGroup(login: number, newGroup: string): Promise<boolean> {
    const response = await this.request<MT4Response<unknown>>(
      'put',
      `/api/v1/account/users/${login}/group`,
      {
        data: { group: newGroup },
      },
    );

    return response.code === 0;
  }

  // ============================================================
  // 持仓管理
  // MT4 的持仓实际上是未关闭的订单
  // ============================================================

  async getPositions(params?: GetPositionsParams): Promise<TradingPosition[]> {
    let path = '/api/v1/account/trades'; // MT4 使用 trades 端点

    if (params?.login) {
      path = `/api/v1/mt4/trades/${params.login}`;
    }

    const response = await this.request<MT4Response<MT4OrderRaw[]>>(
      'get',
      path,
    );

    if (response.code !== 0) {
      throw new Error(response.message || 'Failed to get positions');
    }

    // MT4: 过滤出市场订单 (cmd 0-1) 作为持仓
    let positions = response.data
      .filter((o) => o.cmd === 0 || o.cmd === 1) // BUY or SELL
      .map(this.transformPosition);

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
  // MT4 的挂单是 cmd 2-5 的订单
  // ============================================================

  async getOrders(params?: GetOrdersParams): Promise<TradingOrder[]> {
    let path = '/api/v1/account/trades';

    if (params?.login) {
      path = `/api/v1/mt4/trades/${params.login}`;
    }

    const response = await this.request<MT4Response<MT4OrderRaw[]>>('get', path);

    if (response.code !== 0) {
      throw new Error(response.message || 'Failed to get orders');
    }

    // MT4: 过滤出挂单 (cmd 2-5)
    let orders = response.data
      .filter((o) => o.cmd >= 2 && o.cmd <= 5)
      .map(this.transformOrder);

    if (params?.symbol) {
      orders = orders.filter((o) => o.symbol === params.symbol);
    }

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
  // MT4 的成交记录是已关闭的订单
  // ============================================================

  async getDeals(params?: GetDealsParams): Promise<PaginatedResult<TradingDeal>> {
    const queryParams: Record<string, unknown> = {};

    if (params?.login) queryParams.login = params.login;
    if (params?.symbol) queryParams.symbol = params.symbol;
    if (params?.from) queryParams.from = params.from.toISOString();
    if (params?.to) queryParams.to = params.to.toISOString();
    if (params?.page) queryParams.page = params.page;
    if (params?.pageSize) queryParams.limit = params.pageSize;

    const response = await this.request<
      MT4Response<{ history: MT4HistoryOrderRaw[]; total: number }>
    >('get', '/api/v1/account/history', { params: queryParams });

    if (response.code !== 0) {
      throw new Error(response.message || 'Failed to get deals');
    }

    const page = params?.page || 1;
    const pageSize = params?.pageSize || 50;

    return {
      items: response.data.history.map(this.transformDeal),
      total: response.data.total,
      page,
      pageSize,
      hasMore: page * pageSize < response.data.total,
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
      pageSize: 1000,
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

    const response = await this.request<MT4Response<MT4SymbolRaw[]>>('get', path);

    if (response.code !== 0) {
      throw new Error(response.message || 'Failed to get symbols');
    }

    let symbols = response.data.map(this.transformSymbol);

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
      const response = await this.request<MT4Response<MT4SymbolRaw>>(
        'get',
        `/api/v1/symbols/${symbol}`,
      );

      if (response.code !== 0) {
        return null;
      }

      return this.transformSymbol(response.data);
    } catch {
      return null;
    }
  }

  async getQuote(symbol: string): Promise<TradingQuote | null> {
    try {
      const response = await this.request<MT4Response<MT4QuoteRaw>>(
        'get',
        `/api/v1/symbols/${symbol}/quote`,
      );

      if (response.code !== 0) {
        return null;
      }

      return this.transformQuote(response.data);
    } catch {
      return null;
    }
  }

  async getQuotes(symbols: string[]): Promise<TradingQuote[]> {
    const response = await this.request<MT4Response<MT4QuoteRaw[]>>(
      'post',
      '/api/v1/quotes',
      {
        data: { symbols },
      },
    );

    if (response.code !== 0) {
      throw new Error(response.message || 'Failed to get quotes');
    }

    return response.data.map(this.transformQuote);
  }

  // ============================================================
  // 服务器状态
  // ============================================================

  async getServerStatus(): Promise<ServerStatus> {
    const response = await this.request<
      MT4Response<{
        status: string;
        server_time: string;
        build?: number; // MT4 使用 build 版本号
        users_total?: number;
        trades_total?: number;
      }>
    >('get', '/api/v1/health', { skipAuth: true });

    if (response.code !== 0 || !response.data) {
      throw new Error(response.message || 'Failed to get server status');
    }

    return {
      online: response.data.status === 'healthy' || response.data.status === 'ok',
      serverTime: new Date(response.data.server_time),
      version: response.data.build?.toString(),
      connectedUsers: response.data.users_total,
      activePositions: response.data.trades_total,
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const status = await this.getServerStatus();
      return status.online;
    } catch {
      return false;
    }
  }

  // ============================================================
  // MT4 特有方法
  // ============================================================

  /**
   * 获取所有交易（包括持仓和挂单）
   * MT4 特有方法，返回所有活跃订单
   */
  async getAllTrades(login?: number): Promise<MT4OrderRaw[]> {
    const path = login
      ? `/api/v1/mt4/trades/${login}`
      : '/api/v1/account/trades';

    const response = await this.request<MT4Response<MT4OrderRaw[]>>('get', path);

    if (response.code !== 0) {
      throw new Error(response.message || 'Failed to get trades');
    }

    return response.data;
  }

  /**
   * 获取账户余额操作历史
   * MT4 特有：cmd=6 表示余额操作，cmd=7 表示信用操作
   */
  async getBalanceOperations(
    login: number,
    from?: Date,
    to?: Date,
  ): Promise<TradingDeal[]> {
    const queryParams: Record<string, unknown> = {
      login,
      cmd: '6,7', // 余额和信用操作
    };

    if (from) queryParams.from = from.toISOString();
    if (to) queryParams.to = to.toISOString();

    const response = await this.request<
      MT4Response<{ history: MT4HistoryOrderRaw[]; total: number }>
    >('get', '/api/v1/account/history', { params: queryParams });

    if (response.code !== 0) {
      throw new Error(response.message || 'Failed to get balance operations');
    }

    return response.data.history.map(this.transformDeal);
  }

  // ============================================================
  // 数据转换方法
  // ============================================================

  private transformUser = (raw: MT4UserRaw): TradingUser => ({
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
    registration: raw.regdate ? new Date(raw.regdate) : undefined,
    lastAccess: raw.lastdate ? new Date(raw.lastdate) : undefined,
    comment: raw.comment,
    status: this.mapUserStatus(raw.enable, raw.readonly),
  });

  /**
   * 映射 MT4 用户状态
   */
  private mapUserStatus(enable?: number, readonly?: number): string {
    if (enable === 0) return 'disabled';
    if (readonly === 1) return 'readonly';
    return 'active';
  }

  private transformPosition = (raw: MT4OrderRaw): TradingPosition => ({
    ticket: raw.ticket,
    login: raw.login,
    symbol: raw.symbol,
    type: this.mapMT4CmdToPositionType(raw.cmd),
    volume: raw.volume,
    openPrice: raw.open_price,
    currentPrice: raw.close_price || raw.open_price, // MT4 当前价格可能在 close_price 字段
    openTime: new Date(raw.open_time),
    profit: raw.profit,
    swap: raw.swap,
    commission: raw.commission,
    sl: raw.sl,
    tp: raw.tp,
    comment: raw.comment,
    magic: raw.magic,
  });

  /**
   * 将 MT4 cmd 映射到 PositionType
   */
  private mapMT4CmdToPositionType(cmd: number): PositionType {
    // MT4: 0 = BUY, 1 = SELL
    return cmd === 0 ? PositionType.BUY : PositionType.SELL;
  }

  private transformOrder = (raw: MT4OrderRaw): TradingOrder => ({
    ticket: raw.ticket,
    login: raw.login,
    symbol: raw.symbol,
    type: this.mapMT4CmdToOrderType(raw.cmd),
    volume: raw.volume,
    price: raw.open_price,
    priceOpen: raw.open_price,
    priceCurrent: raw.close_price,
    sl: raw.sl,
    tp: raw.tp,
    timeSetup: new Date(raw.open_time),
    timeDone: raw.close_time ? new Date(raw.close_time) : undefined,
    state: this.mapMT4OrderState(raw.state),
    comment: raw.comment,
    magic: raw.magic,
  });

  /**
   * 将 MT4 cmd 映射到 OrderType
   * MT4 cmd: 0=Buy, 1=Sell, 2=Buy Limit, 3=Sell Limit, 4=Buy Stop, 5=Sell Stop
   */
  private mapMT4CmdToOrderType(cmd: number): OrderType {
    switch (cmd) {
      case 0:
        return OrderType.BUY;
      case 1:
        return OrderType.SELL;
      case 2:
        return OrderType.BUY_LIMIT;
      case 3:
        return OrderType.SELL_LIMIT;
      case 4:
        return OrderType.BUY_STOP;
      case 5:
        return OrderType.SELL_STOP;
      default:
        return OrderType.BUY; // 默认值
    }
  }

  /**
   * 映射 MT4 订单状态
   */
  private mapMT4OrderState(state?: string): OrderState {
    if (!state) return OrderState.PLACED;

    switch (state.toLowerCase()) {
      case 'pending':
        return OrderState.PENDING;
      case 'started':
        return OrderState.STARTED;
      case 'placed':
        return OrderState.PLACED;
      case 'canceled':
      case 'cancelled':
        return OrderState.CANCELED;
      case 'partial':
        return OrderState.PARTIAL;
      case 'filled':
        return OrderState.FILLED;
      case 'rejected':
        return OrderState.REJECTED;
      case 'expired':
        return OrderState.EXPIRED;
      default:
        return OrderState.PLACED;
    }
  }

  private transformDeal = (raw: MT4HistoryOrderRaw): TradingDeal => ({
    ticket: raw.ticket,
    login: raw.login,
    symbol: raw.symbol,
    type: this.mapMT4CmdToDealType(raw.cmd),
    entry: this.determineDealEntry(raw),
    volume: raw.volume,
    price: raw.close_price,
    profit: raw.profit,
    swap: raw.swap,
    commission: raw.commission,
    time: new Date(raw.close_time),
    order: raw.ticket, // MT4 中订单号就是 ticket
    positionId: undefined, // MT4 没有 position_id 概念
    comment: raw.comment,
    magic: raw.magic,
  });

  /**
   * 将 MT4 cmd 映射到 DealType
   */
  private mapMT4CmdToDealType(cmd: number): DealType {
    switch (cmd) {
      case 0:
        return DealType.BUY;
      case 1:
        return DealType.SELL;
      case 6:
        return DealType.BALANCE;
      case 7:
        return DealType.CREDIT;
      default:
        return DealType.BUY;
    }
  }

  /**
   * 确定成交方向
   * MT4 的成交都是关闭订单，所以方向与开仓相反
   */
  private determineDealEntry(raw: MT4HistoryOrderRaw): DealEntry {
    // MT4 历史订单都是已关闭的，所以是 OUT
    // 如果是余额/信用操作，则使用 IN
    if (raw.cmd >= 6) {
      return DealEntry.IN;
    }
    return DealEntry.OUT;
  }

  private transformSymbol = (raw: MT4SymbolRaw): TradingSymbol => ({
    symbol: raw.symbol,
    description: raw.description,
    path: undefined, // MT4 没有 path 字段
    digits: raw.digits,
    contractSize: raw.contract_size,
    tickSize: raw.point, // MT4 使用 point
    tickValue: undefined, // MT4 可能没有这个字段
    spread: raw.spread,
    bid: raw.bid,
    ask: raw.ask,
    high: raw.high,
    low: raw.low,
    volumeMin: raw.lot_min,
    volumeMax: raw.lot_max,
    volumeStep: raw.lot_step,
    currency: raw.currency,
    profitCurrency: undefined, // MT4 可能没有
    marginCurrency: raw.margin_currency,
    tradeMode: raw.trade_mode,
    enabled: raw.enabled,
  });

  private transformQuote = (raw: MT4QuoteRaw): TradingQuote => ({
    symbol: raw.symbol,
    bid: raw.bid,
    ask: raw.ask,
    spread: raw.spread ?? (raw.ask - raw.bid) * Math.pow(10, 5), // 如果没有 spread，计算一个
    time: new Date(raw.time),
    high: raw.high,
    low: raw.low,
    volume: undefined, // MT4 报价通常没有 volume
  });

  // ============================================================
  // 交易操作方法实现
  // ============================================================

  /**
   * 开仓 (市价单)
   * 中间件端点: POST /api/v1/trading/orders/market
   */
  async openOrder(params: OpenOrderParams): Promise<TradeResult> {
    const response = await this.request<MT4Response<MT4TradeResultRaw>>(
      'post',
      '/api/v1/trading/orders/market',
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
    const response = await this.request<MT4Response<MT4TradeResultRaw>>(
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
    const response = await this.request<MT4Response<MT4TradeResultRaw>>(
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
    const response = await this.request<MT4Response<MT4TradeResultRaw>>(
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
    const response = await this.request<MT4Response<MT4TradeResultRaw>>(
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
    const response = await this.request<MT4Response<MT4TradeResultRaw>>(
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
    const response = await this.request<MT4Response<MT4TradeResultRaw>>(
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
      const response = await this.request<MT4Response<MT4CreateUserResultRaw>>(
        'post',
        '/api/v1/account/users',
        {
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
        },
      );

      if (response.code !== 0) {
        return {
          success: false,
          message: response.message || 'Failed to create user',
        };
      }

      return {
        success: true,
        login: response.data.login,
        message: response.data.message,
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
    const response = await this.request<MT4Response<unknown>>(
      'put',
      `/api/v1/account/users/${params.login}`,
      {
        data: {
          name: params.name,
          group: params.group,
          email: params.email,
          phone: params.phone,
          leverage: params.leverage,
          comment: params.comment,
          agent: params.agent,
        },
      },
    );

    return response.code === 0;
  }

  /**
   * 修改用户密码
   * 中间件端点: PUT /api/v1/account/users/{login}/password
   */
  async changePassword(params: ChangePasswordParams): Promise<boolean> {
    const response = await this.request<MT4Response<unknown>>(
      'put',
      `/api/v1/account/users/${params.login}/password`,
      {
        data: {
          password: params.password,
          type: params.type,
        },
      },
    );

    return response.code === 0;
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

    const response = await this.request<MT4Response<MT4CandleRaw[]>>(
      'get',
      '/api/v1/market/candles',
      { params: queryParams },
    );

    if (response.code !== 0) {
      throw new Error(response.message || 'Failed to get candles');
    }

    return response.data.map(this.transformCandle);
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

    const response = await this.request<MT4Response<MT4TickRaw[]>>(
      'get',
      '/api/v1/market/ticks',
      { params: queryParams },
    );

    if (response.code !== 0) {
      throw new Error(response.message || 'Failed to get ticks');
    }

    // 使用请求参数中的 symbol 填充每个 tick
    return response.data.map((raw) => this.transformTick(raw, params.symbol));
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
    const response = await this.request<
      MT4Response<{
        total: number;
        success: number;
        failed: number;
        results: MT4TradeResultRaw[];
      }>
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

    if (response.code !== 0) {
      throw new Error(response.message || 'Failed to execute batch open');
    }

    return {
      total: response.data.total,
      success: response.data.success,
      failed: response.data.failed,
      results: response.data.results.map((r) => ({
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
    const response = await this.request<
      MT4Response<{
        total: number;
        success: number;
        failed: number;
        results: MT4TradeResultRaw[];
      }>
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

    if (response.code !== 0) {
      throw new Error(response.message || 'Failed to execute batch close');
    }

    return {
      total: response.data.total,
      success: response.data.success,
      failed: response.data.failed,
      results: response.data.results.map((r) => ({
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
    response: MT4Response<MT4TradeResultRaw>,
  ): TradeResult {
    // MT4 返回码 0 表示成功
    const isSuccess = response.code === 0 &&
      (response.data.retcode === 0 || response.data.retcode === 10009);

    return {
      success: isSuccess,
      ticket: response.data.ticket,
      volume: response.data.volume,
      price: response.data.price,
      retcode: response.data.retcode,
      message: response.data.message || response.message,
    };
  }

  private transformCandle = (raw: MT4CandleRaw): CandleData => ({
    time: new Date(raw.time * 1000),
    open: raw.open,
    high: raw.high,
    low: raw.low,
    close: raw.close,
    tickVolume: raw.tick_volume,
    volume: raw.volume,
    spread: raw.spread,
  });

  private transformTick = (raw: MT4TickRaw, symbol: string): TickData => ({
    symbol,
    time: new Date(raw.time), // MT4 tick 时间通常是毫秒
    bid: raw.bid,
    ask: raw.ask,
    last: raw.last,
    volume: raw.volume,
    flags: raw.flags,
  });
}
