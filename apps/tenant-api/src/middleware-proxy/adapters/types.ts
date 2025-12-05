/**
 * 交易平台适配器统一类型定义
 * 用于抽象 MT5/MT4 的差异
 */

// ============================================================
// 平台枚举
// ============================================================

export enum PlatformType {
  MT5 = 'MT5',
  MT4 = 'MT4',
}

// ============================================================
// 统一的交易用户类型
// ============================================================

export interface TradingUser {
  login: number;
  name: string;
  group: string;
  email?: string;
  balance: number;
  equity: number;
  margin: number;
  marginFree: number;
  marginLevel: number;
  leverage: number;
  credit?: number;
  registration?: Date;
  lastAccess?: Date;
  comment?: string;
  status?: string;
}

// ============================================================
// 统一的持仓类型
// ============================================================

export interface TradingPosition {
  ticket: number;
  login: number;
  symbol: string;
  type: PositionType;
  volume: number;
  openPrice: number;
  currentPrice: number;
  openTime: Date;
  profit: number;
  swap: number;
  commission?: number;
  sl?: number;
  tp?: number;
  comment?: string;
  magic?: number;
}

export enum PositionType {
  BUY = 0,
  SELL = 1,
}

// ============================================================
// 统一的订单类型
// ============================================================

export interface TradingOrder {
  ticket: number;
  login: number;
  symbol: string;
  type: OrderType;
  volume: number;
  price: number;
  priceOpen?: number;
  priceCurrent?: number;
  sl?: number;
  tp?: number;
  timeSetup: Date;
  timeDone?: Date;
  state: OrderState;
  comment?: string;
  magic?: number;
}

export enum OrderType {
  BUY = 0,
  SELL = 1,
  BUY_LIMIT = 2,
  SELL_LIMIT = 3,
  BUY_STOP = 4,
  SELL_STOP = 5,
  BUY_STOP_LIMIT = 6,
  SELL_STOP_LIMIT = 7,
}

export enum OrderState {
  PENDING = 0,
  STARTED = 1,
  PLACED = 2,
  CANCELED = 3,
  PARTIAL = 4,
  FILLED = 5,
  REJECTED = 6,
  EXPIRED = 7,
}

// ============================================================
// 统一的成交类型
// ============================================================

export interface TradingDeal {
  ticket: number;
  login: number;
  symbol: string;
  type: DealType;
  entry: DealEntry;
  volume: number;
  price: number;
  profit: number;
  swap: number;
  commission: number;
  time: Date;
  order?: number;
  positionId?: number;
  comment?: string;
  magic?: number;
}

export enum DealType {
  BUY = 0,
  SELL = 1,
  BALANCE = 2,
  CREDIT = 3,
  CHARGE = 4,
  CORRECTION = 5,
  BONUS = 6,
  COMMISSION = 7,
}

export enum DealEntry {
  IN = 0,
  OUT = 1,
  INOUT = 2,
  OUT_BY = 3,
}

// ============================================================
// 统一的品种类型
// ============================================================

export interface TradingSymbol {
  symbol: string;
  description: string;
  path?: string;
  digits: number;
  contractSize: number;
  tickSize: number;
  tickValue?: number;
  spread: number;
  bid: number;
  ask: number;
  high?: number;
  low?: number;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
  currency?: string;
  profitCurrency?: string;
  marginCurrency?: string;
  tradeMode?: TradeMode;
  enabled?: boolean;
}

export enum TradeMode {
  DISABLED = 0,
  LONG_ONLY = 1,
  SHORT_ONLY = 2,
  CLOSE_ONLY = 3,
  FULL = 4,
}

// ============================================================
// 统一的报价类型
// ============================================================

export interface TradingQuote {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  time: Date;
  high?: number;
  low?: number;
  volume?: number;
}

// ============================================================
// 通用分页和查询参数
// ============================================================

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface GetUsersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  group?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface GetPositionsParams {
  login?: number;
  symbol?: string;
}

export interface GetOrdersParams {
  login?: number;
  symbol?: string;
  state?: OrderState;
}

export interface GetDealsParams {
  login?: number;
  symbol?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export interface GetSymbolsParams {
  search?: string;
  group?: string;
}

// ============================================================
// 用户组操作
// ============================================================

export interface UpdateUserGroupParams {
  login: number;
  newGroup: string;
}

// ============================================================
// 服务器状态
// ============================================================

export interface ServerStatus {
  online: boolean;
  serverTime: Date;
  version?: string;
  connectedUsers?: number;
  activePositions?: number;
}

// ============================================================
// 适配器配置
// ============================================================

export interface AdapterConfig {
  baseUrl: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

// ============================================================
// MT 服务器配置（用于适配器）
// ============================================================

/**
 * MT 服务器配置
 * 用于创建和配置平台适配器
 * 注意：managerPassword 是解密后的明文密码，仅在内存中使用
 */
export interface MtServerConfig {
  tenantId: string;
  serverId: string;
  platformType: PlatformType;
  middlewareUrl: string;
  serverAddress: string;
  managerLogin: number;
  managerPassword: string;
}
