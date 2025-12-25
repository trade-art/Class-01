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
// 交易操作类型
// ============================================================

/**
 * 开仓请求参数
 */
export interface OpenOrderParams {
  login: number;
  symbol: string;
  type: OrderType;
  volume: number;
  price?: number; // 市价单可不传
  sl?: number;
  tp?: number;
  deviation?: number;
  comment?: string;
  magic?: number;
}

/**
 * 平仓请求参数
 */
export interface ClosePositionParams {
  login: number;
  ticket: number;
  volume?: number; // 部分平仓
  price?: number;
  deviation?: number;
  comment?: string;
}

/**
 * 修改持仓参数
 */
export interface ModifyPositionParams {
  login: number;
  ticket: number;
  sl?: number;
  tp?: number;
}

/**
 * 挂单请求参数
 */
export interface PendingOrderParams {
  login: number;
  symbol: string;
  type: OrderType; // 限价单/止损单类型
  volume: number;
  price: number;
  sl?: number;
  tp?: number;
  expiration?: Date;
  comment?: string;
  magic?: number;
}

/**
 * 修改挂单参数
 */
export interface ModifyOrderParams {
  login: number;
  ticket: number;
  price?: number;
  sl?: number;
  tp?: number;
  expiration?: Date;
}

/**
 * 取消挂单参数
 */
export interface CancelOrderParams {
  login: number;
  ticket: number;
}

/**
 * 余额操作参数
 */
export interface BalanceOperationParams {
  login: number;
  type: BalanceOperationType;
  amount: number;
  comment?: string;
}

export enum BalanceOperationType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  CREDIT = 'credit',
  CORRECTION = 'correction',
}

/**
 * 交易操作结果
 */
export interface TradeResult {
  success: boolean;
  ticket?: number; // 订单/持仓票号
  retcode?: number; // MT5 返回码
  message?: string;
  volume?: number; // 实际成交量
  price?: number; // 实际成交价
}

/**
 * 异步任务状态
 */
export interface AsyncTaskStatus {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: TradeResult;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

// ============================================================
// 用户管理操作类型
// ============================================================

/**
 * 创建用户参数
 */
export interface CreateUserParams {
  name: string;
  group: string;
  password: string;
  investorPassword?: string;
  email?: string;
  phone?: string;
  leverage?: number;
  comment?: string;
  agent?: number;
  balance?: number;
}

/**
 * 更新用户参数
 */
export interface UpdateUserParams {
  login: number;
  name?: string;
  group?: string;
  email?: string;
  phone?: string;
  leverage?: number;
  comment?: string;
  agent?: number;
}

/**
 * 修改密码参数
 */
export interface ChangePasswordParams {
  login: number;
  password: string;
  type: 'main' | 'investor';
}

/**
 * 创建用户结果
 */
export interface CreateUserResult {
  success: boolean;
  login?: number;
  message?: string;
}

// ============================================================
// 市场数据类型
// ============================================================

/**
 * K线数据
 */
export interface CandleData {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume: number;
  volume?: number;
  spread?: number;
}

/**
 * Tick 数据
 */
export interface TickData {
  symbol: string;
  time: Date;
  bid: number;
  ask: number;
  last?: number;
  volume?: number;
  flags?: number;
}

/**
 * K线查询参数
 */
export interface GetCandlesParams {
  symbol: string;
  timeframe: Timeframe;
  from?: Date;
  to?: Date;
  count?: number;
}

/**
 * Tick 查询参数
 */
export interface GetTicksParams {
  symbol: string;
  from?: Date;
  to?: Date;
  count?: number;
}

export enum Timeframe {
  M1 = 'M1',
  M5 = 'M5',
  M15 = 'M15',
  M30 = 'M30',
  H1 = 'H1',
  H4 = 'H4',
  D1 = 'D1',
  W1 = 'W1',
  MN1 = 'MN1',
}

// ============================================================
// 批量操作类型
// ============================================================

/**
 * 批量开仓参数
 */
export interface BatchOpenOrderParams {
  orders: OpenOrderParams[];
}

/**
 * 批量平仓参数
 */
export interface BatchClosePositionParams {
  positions: ClosePositionParams[];
}

/**
 * 批量操作结果
 */
export interface BatchOperationResult {
  total: number;
  success: number;
  failed: number;
  results: TradeResult[];
}

/**
 * 批量查询参数
 */
export interface BatchQueryParams {
  logins: number[];
}

/**
 * 批量账户查询结果
 */
export interface BatchAccountsResult {
  accounts: TradingUser[];
  total: number;
}

/**
 * 批量持仓查询结果
 */
export interface BatchPositionsResult {
  positions: TradingPosition[];
  total: number;
  byLogin: Record<number, TradingPosition[]>;
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
  /**
   * Service Token 配置 (用于 ServiceToken 认证模式)
   * 包含已加密的 Manager 凭证
   */
  serviceToken?: {
    /** JWT Service Token */
    token: string;
    /** Token 类型 (Bearer) */
    tokenType: string;
    /** 过期时间 (Unix 时间戳) */
    expiresAt: number;
  };
  /**
   * 额外的认证头信息
   */
  authHeaders?: Record<string, string>;
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
  /** Manager UUID - 用于 Service Token 认证和连接池查找 */
  managerId?: string;
}
