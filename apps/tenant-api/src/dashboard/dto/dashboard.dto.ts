import { ApiProperty } from '@nestjs/swagger';

/**
 * 账户摘要 DTO
 */
export class AccountSummaryDto {
  @ApiProperty({ description: '总余额' })
  totalBalance: number;

  @ApiProperty({ description: '总净值' })
  totalEquity: number;

  @ApiProperty({ description: '总浮动盈亏' })
  totalProfit: number;

  @ApiProperty({ description: '已用保证金' })
  totalMargin: number;

  @ApiProperty({ description: '可用保证金' })
  totalFreeMargin: number;

  @ApiProperty({ description: '保证金水平 (%)' })
  marginLevel: number;
}

/**
 * 持仓统计 DTO
 */
export class PositionsSummaryDto {
  @ApiProperty({ description: '持仓数量' })
  totalPositions: number;

  @ApiProperty({ description: '总手数' })
  totalVolume: number;

  @ApiProperty({ description: '浮动盈亏' })
  totalProfit: number;

  @ApiProperty({ description: '多头数量' })
  buyCount: number;

  @ApiProperty({ description: '空头数量' })
  sellCount: number;

  @ApiProperty({ description: '多头盈亏' })
  buyProfit: number;

  @ApiProperty({ description: '空头盈亏' })
  sellProfit: number;
}

/**
 * 按品种统计 DTO
 */
export class SymbolStatDto {
  @ApiProperty({ description: '品种' })
  symbol: string;

  @ApiProperty({ description: '持仓数量' })
  count: number;

  @ApiProperty({ description: '总手数' })
  volume: number;

  @ApiProperty({ description: '盈亏' })
  profit: number;
}

/**
 * 近期交易 DTO
 */
export class RecentDealDto {
  @ApiProperty({ description: '订单号' })
  ticket: number;

  @ApiProperty({ description: '账号' })
  login?: number;

  @ApiProperty({ description: '品种' })
  symbol: string;

  @ApiProperty({ description: '类型' })
  type: string;

  @ApiProperty({ description: '手数' })
  volume: number;

  @ApiProperty({ description: '盈亏' })
  profit: number;

  @ApiProperty({ description: '时间' })
  time: string;
}

/**
 * 交易趋势数据点 DTO
 */
export class TradingTrendDto {
  @ApiProperty({ description: '日期 (YYYY-MM-DD)' })
  date: string;

  @ApiProperty({ description: '交易笔数' })
  trades: number;

  @ApiProperty({ description: '交易量（手数）' })
  volume: number;

  @ApiProperty({ description: '盈亏' })
  profit: number;
}

/**
 * 用户统计 DTO
 */
export class UsersSummaryDto {
  @ApiProperty({ description: '总用户数' })
  totalUsers: number;

  @ApiProperty({ description: '活跃用户数（有余额或持仓）' })
  activeUsers: number;
}

/**
 * Dashboard 完整数据 DTO
 */
export class DashboardDataDto {
  @ApiProperty({ description: '账户摘要', type: AccountSummaryDto })
  accountSummary: AccountSummaryDto;

  @ApiProperty({ description: '持仓统计', type: PositionsSummaryDto })
  positionsSummary: PositionsSummaryDto;

  @ApiProperty({ description: '用户统计', type: UsersSummaryDto })
  usersSummary: UsersSummaryDto;

  @ApiProperty({ description: '按品种统计', type: [SymbolStatDto] })
  bySymbol: SymbolStatDto[];

  @ApiProperty({ description: '近期交易', type: [RecentDealDto] })
  recentDeals: RecentDealDto[];

  @ApiProperty({ description: '交易趋势（最近7天）', type: [TradingTrendDto] })
  tradingTrend: TradingTrendDto[];

  @ApiProperty({ description: '服务器状态' })
  serverStatus: {
    /** 中间件服务是否在线（健康检查） */
    connected: boolean;
    /** API 认证是否成功（可以获取数据） */
    authenticated: boolean;
    serverTime: string;
    ping: number;
  };
}

/**
 * Dashboard 基础数据 DTO（不包含交易历史，快速加载）
 */
export class DashboardBaseDataDto {
  @ApiProperty({ description: '账户摘要', type: AccountSummaryDto })
  accountSummary: AccountSummaryDto;

  @ApiProperty({ description: '持仓统计', type: PositionsSummaryDto })
  positionsSummary: PositionsSummaryDto;

  @ApiProperty({ description: '用户统计', type: UsersSummaryDto })
  usersSummary: UsersSummaryDto;

  @ApiProperty({ description: '服务器状态' })
  serverStatus: {
    connected: boolean;
    authenticated: boolean;
    serverTime: string;
    ping: number;
  };
}

/**
 * 交易统计数据 DTO（交易历史相关，异步加载）
 */
export class TradingStatsDto {
  @ApiProperty({ description: '按品种统计', type: [SymbolStatDto] })
  bySymbol: SymbolStatDto[];

  @ApiProperty({ description: '近期交易', type: [RecentDealDto] })
  recentDeals: RecentDealDto[];

  @ApiProperty({ description: '交易趋势（最近7天）', type: [TradingTrendDto] })
  tradingTrend: TradingTrendDto[];

  @ApiProperty({ description: '今日交易笔数' })
  todayTrades: number;

  @ApiProperty({ description: '总交易量（30天）' })
  totalVolume: number;

  @ApiProperty({ description: '总盈亏（30天）' })
  totalProfit: number;
}

/**
 * 快速统计卡片 DTO
 */
export class QuickStatsDto {
  @ApiProperty({ description: '今日盈亏' })
  todayProfit: number;

  @ApiProperty({ description: '本周盈亏' })
  weekProfit: number;

  @ApiProperty({ description: '本月盈亏' })
  monthProfit: number;

  @ApiProperty({ description: '今日交易笔数' })
  todayTrades: number;

  @ApiProperty({ description: '活跃持仓数' })
  activePositions: number;

  @ApiProperty({ description: '挂单数量' })
  pendingOrders: number;
}

/**
 * 系统状态 DTO（轻量级状态检查）
 */
export class SystemStatusDto {
  @ApiProperty({ description: '中间件服务是否在线（健康检查）' })
  middleware: boolean;

  @ApiProperty({ description: 'MT5 API 是否可用（认证成功）' })
  mt5: boolean;

  @ApiProperty({ description: '服务器时间' })
  serverTime: string;

  @ApiProperty({ description: '延迟 (ms)' })
  ping: number;
}
