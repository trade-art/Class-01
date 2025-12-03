/**
 * WebSocket 事件类型
 */
export enum WsEventType {
  // 持仓事件
  POSITION_UPDATE = 'position:update',
  POSITION_OPEN = 'position:open',
  POSITION_CLOSE = 'position:close',

  // 报价事件
  QUOTE_UPDATE = 'quote:update',

  // 交易事件
  TRADE_NEW = 'trade:new',

  // 风控事件
  RISK_ALERT = 'risk:alert',

  // 系统事件
  SYSTEM_NOTIFICATION = 'system:notification',
  CONNECTION_STATUS = 'connection:status',
}

/**
 * 持仓更新数据
 */
export interface PositionUpdateData {
  ticket: number;
  login: number;
  symbol: string;
  type: string;
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl?: number;
  tp?: number;
  profit: number;
  swap: number;
  commission: number;
  openTime: string;
}

/**
 * 报价更新数据
 */
export interface QuoteUpdateData {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  time: string;
  spread: number;
  change: number;
  changePercent: number;
}

/**
 * 新交易数据
 */
export interface TradeNewData {
  ticket: number;
  login: number;
  symbol: string;
  type: string;
  volume: number;
  price: number;
  profit: number;
  commission: number;
  swap: number;
  time: string;
  comment?: string;
}

/**
 * 风控预警数据
 */
export interface RiskAlertData {
  id: string;
  type: string;
  level: string;
  message: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

/**
 * 连接状态数据
 */
export interface ConnectionStatusData {
  connected: boolean;
  serverName?: string;
  latency?: number;
  message?: string;
}

/**
 * 订阅请求
 */
export interface SubscribeRequest {
  channel: string;
  symbols?: string[];
}

/**
 * 取消订阅请求
 */
export interface UnsubscribeRequest {
  channel: string;
  symbols?: string[];
}

/**
 * WebSocket 消息包装
 */
export interface WsMessage<T = unknown> {
  event: WsEventType;
  data: T;
  timestamp: string;
}
