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
} from './types';

// ============================================================
// MT5 原始响应类型
// ============================================================

interface MT5Response<T> {
  success: boolean;
  data: T;
  message?: string;
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
  entry: number;
  volume: number;
  price: number;
  profit: number;
  swap: number;
  commission: number;
  time: string;
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

  async authenticate(
    managerLogin: number,
    managerPassword: string,
  ): Promise<string> {
    const response = await this.request<
      MT5Response<{ access_token: string; expires_in: number }>
    >('post', '/api/v1/auth/login', {
      data: {
        login: managerLogin,
        password: managerPassword,
      },
      skipAuth: true,
    });

    if (!response.success) {
      throw new Error(response.message || 'Authentication failed');
    }

    this.accessToken = response.data.access_token;
    this.tokenExpiry = new Date(Date.now() + response.data.expires_in * 1000);

    this.logger.log(`MT5 认证成功，令牌有效期至 ${this.tokenExpiry}`);

    return this.accessToken;
  }

  async refreshToken(): Promise<string> {
    const response = await this.request<
      MT5Response<{ access_token: string; expires_in: number }>
    >('post', '/api/v1/auth/refresh', {
      skipAuth: false,
    });

    if (!response.success) {
      throw new Error(response.message || 'Token refresh failed');
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
      MT5Response<{ users: MT5UserRaw[]; total: number }>
    >('get', '/api/v1/account/users', { params: queryParams });

    if (!response.success) {
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
      const response = await this.request<MT5Response<MT5UserRaw>>(
        'get',
        `/api/v1/account/users/${login}`,
      );

      if (!response.success) {
        return null;
      }

      return this.transformUser(response.data);
    } catch {
      return null;
    }
  }

  async updateUserGroup(login: number, newGroup: string): Promise<boolean> {
    const response = await this.request<MT5Response<unknown>>(
      'put',
      `/api/v1/account/users/${login}/group`,
      {
        data: { group: newGroup },
      },
    );

    return response.success;
  }

  // ============================================================
  // 持仓管理
  // ============================================================

  async getPositions(params?: GetPositionsParams): Promise<TradingPosition[]> {
    let path = '/api/v1/account/positions';

    if (params?.login) {
      path = `/api/v1/mt5/positions/${params.login}`;
    }

    const response = await this.request<MT5Response<MT5PositionRaw[]>>(
      'get',
      path,
    );

    if (!response.success) {
      throw new Error(response.message || 'Failed to get positions');
    }

    let positions = response.data.map(this.transformPosition);

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
    let path = '/api/v1/account/orders';

    if (params?.login) {
      path = `/api/v1/mt5/orders/${params.login}`;
    }

    const response = await this.request<MT5Response<MT5OrderRaw[]>>('get', path);

    if (!response.success) {
      throw new Error(response.message || 'Failed to get orders');
    }

    let orders = response.data.map(this.transformOrder);

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
      MT5Response<{ deals: MT5DealRaw[]; total: number }>
    >('get', '/api/v1/account/deals', { params: queryParams });

    if (!response.success) {
      throw new Error(response.message || 'Failed to get deals');
    }

    const page = params?.page || 1;
    const pageSize = params?.pageSize || 50;

    return {
      items: response.data.deals.map(this.transformDeal),
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

    const response = await this.request<MT5Response<MT5SymbolRaw[]>>('get', path);

    if (!response.success) {
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
      const response = await this.request<MT5Response<MT5SymbolRaw>>(
        'get',
        `/api/v1/symbols/${symbol}`,
      );

      if (!response.success) {
        return null;
      }

      return this.transformSymbol(response.data);
    } catch {
      return null;
    }
  }

  async getQuote(symbol: string): Promise<TradingQuote | null> {
    try {
      const response = await this.request<MT5Response<MT5QuoteRaw>>(
        'get',
        `/api/v1/symbols/${symbol}/quote`,
      );

      if (!response.success) {
        return null;
      }

      return this.transformQuote(response.data);
    } catch {
      return null;
    }
  }

  async getQuotes(symbols: string[]): Promise<TradingQuote[]> {
    const response = await this.request<MT5Response<MT5QuoteRaw[]>>(
      'post',
      '/api/v1/quotes',
      {
        data: { symbols },
      },
    );

    if (!response.success) {
      throw new Error(response.message || 'Failed to get quotes');
    }

    return response.data.map(this.transformQuote);
  }

  // ============================================================
  // 服务器状态
  // ============================================================

  async getServerStatus(): Promise<ServerStatus> {
    const response = await this.request<
      MT5Response<{
        status: string;
        server_time: string;
        version?: string;
        connected_users?: number;
        active_positions?: number;
      }>
    >('get', '/api/v1/health', { skipAuth: true });

    return {
      online: response.data.status === 'healthy',
      serverTime: new Date(response.data.server_time),
      version: response.data.version,
      connectedUsers: response.data.connected_users,
      activePositions: response.data.active_positions,
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

  private transformDeal = (raw: MT5DealRaw): TradingDeal => ({
    ticket: raw.ticket,
    login: raw.login,
    symbol: raw.symbol,
    type: raw.type as DealType,
    entry: raw.entry as DealEntry,
    volume: raw.volume,
    price: raw.price,
    profit: raw.profit,
    swap: raw.swap,
    commission: raw.commission,
    time: new Date(raw.time),
    order: raw.order,
    positionId: raw.position_id,
    comment: raw.comment,
    magic: raw.magic,
  });

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
}
