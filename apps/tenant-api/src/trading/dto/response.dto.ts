import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 分页响应基础 DTO
 */
export class PaginatedResponseDto<T> {
  @ApiProperty({ description: '数据列表' })
  items: T[];

  @ApiProperty({ description: '总数' })
  total: number;

  @ApiProperty({ description: '当前页' })
  page: number;

  @ApiProperty({ description: '每页数量' })
  pageSize: number;

  @ApiProperty({ description: '是否有更多' })
  hasMore: boolean;
}

/**
 * 交易用户 DTO
 */
export class TradingUserDto {
  @ApiProperty({ description: '登录号' })
  login: number;

  @ApiProperty({ description: '姓名' })
  name: string;

  @ApiProperty({ description: '用户组' })
  group: string;

  @ApiPropertyOptional({ description: '邮箱' })
  email?: string;

  @ApiProperty({ description: '余额' })
  balance: number;

  @ApiProperty({ description: '净值' })
  equity: number;

  @ApiProperty({ description: '保证金' })
  margin: number;

  @ApiProperty({ description: '可用保证金' })
  marginFree: number;

  @ApiProperty({ description: '保证金水平' })
  marginLevel: number;

  @ApiProperty({ description: '杠杆' })
  leverage: number;

  @ApiPropertyOptional({ description: '信用额度' })
  credit?: number;

  @ApiPropertyOptional({ description: '注册时间' })
  registration?: Date;

  @ApiPropertyOptional({ description: '最后访问时间' })
  lastAccess?: Date;

  @ApiPropertyOptional({ description: '备注' })
  comment?: string;

  @ApiPropertyOptional({ description: '状态' })
  status?: string;
}

/**
 * 交易持仓 DTO
 */
export class TradingPositionDto {
  @ApiProperty({ description: '持仓单号' })
  ticket: number;

  @ApiProperty({ description: '用户登录号' })
  login: number;

  @ApiProperty({ description: '品种' })
  symbol: string;

  @ApiProperty({ description: '类型 (0=BUY, 1=SELL)' })
  type: number;

  @ApiProperty({ description: '手数' })
  volume: number;

  @ApiProperty({ description: '开仓价' })
  openPrice: number;

  @ApiProperty({ description: '当前价' })
  currentPrice: number;

  @ApiProperty({ description: '开仓时间' })
  openTime: Date;

  @ApiProperty({ description: '盈亏' })
  profit: number;

  @ApiProperty({ description: '库存费' })
  swap: number;

  @ApiPropertyOptional({ description: '手续费' })
  commission?: number;

  @ApiPropertyOptional({ description: '止损' })
  sl?: number;

  @ApiPropertyOptional({ description: '止盈' })
  tp?: number;

  @ApiPropertyOptional({ description: '备注' })
  comment?: string;

  @ApiPropertyOptional({ description: 'Magic Number' })
  magic?: number;
}

/**
 * 交易订单 DTO
 */
export class TradingOrderDto {
  @ApiProperty({ description: '订单号' })
  ticket: number;

  @ApiProperty({ description: '用户登录号' })
  login: number;

  @ApiProperty({ description: '品种' })
  symbol: string;

  @ApiProperty({ description: '类型' })
  type: number;

  @ApiProperty({ description: '手数' })
  volume: number;

  @ApiProperty({ description: '价格' })
  price: number;

  @ApiPropertyOptional({ description: '开仓价' })
  priceOpen?: number;

  @ApiPropertyOptional({ description: '当前价' })
  priceCurrent?: number;

  @ApiPropertyOptional({ description: '止损' })
  sl?: number;

  @ApiPropertyOptional({ description: '止盈' })
  tp?: number;

  @ApiProperty({ description: '下单时间' })
  timeSetup: Date;

  @ApiPropertyOptional({ description: '成交时间' })
  timeDone?: Date;

  @ApiProperty({ description: '状态' })
  state: number;

  @ApiPropertyOptional({ description: '备注' })
  comment?: string;

  @ApiPropertyOptional({ description: 'Magic Number' })
  magic?: number;
}

/**
 * 交易成交 DTO
 */
export class TradingDealDto {
  @ApiProperty({ description: '成交单号' })
  ticket: number;

  @ApiProperty({ description: '用户登录号' })
  login: number;

  @ApiProperty({ description: '品种' })
  symbol: string;

  @ApiProperty({ description: '类型' })
  type: number;

  @ApiProperty({ description: '入场类型' })
  entry: number;

  @ApiProperty({ description: '手数' })
  volume: number;

  @ApiProperty({ description: '价格' })
  price: number;

  @ApiProperty({ description: '盈亏' })
  profit: number;

  @ApiProperty({ description: '库存费' })
  swap: number;

  @ApiProperty({ description: '手续费' })
  commission: number;

  @ApiProperty({ description: '时间' })
  time: Date;

  @ApiPropertyOptional({ description: '订单号' })
  order?: number;

  @ApiPropertyOptional({ description: '持仓ID' })
  positionId?: number;

  @ApiPropertyOptional({ description: '备注' })
  comment?: string;

  @ApiPropertyOptional({ description: 'Magic Number' })
  magic?: number;
}

/**
 * 交易品种 DTO
 */
export class TradingSymbolDto {
  @ApiProperty({ description: '品种代码' })
  symbol: string;

  @ApiProperty({ description: '描述' })
  description: string;

  @ApiPropertyOptional({ description: '路径' })
  path?: string;

  @ApiProperty({ description: '小数位' })
  digits: number;

  @ApiProperty({ description: '合约大小' })
  contractSize: number;

  @ApiProperty({ description: '最小变动单位' })
  tickSize: number;

  @ApiPropertyOptional({ description: '最小变动价值' })
  tickValue?: number;

  @ApiProperty({ description: '点差' })
  spread: number;

  @ApiProperty({ description: '买价' })
  bid: number;

  @ApiProperty({ description: '卖价' })
  ask: number;

  @ApiPropertyOptional({ description: '最高价' })
  high?: number;

  @ApiPropertyOptional({ description: '最低价' })
  low?: number;

  @ApiProperty({ description: '最小交易量' })
  volumeMin: number;

  @ApiProperty({ description: '最大交易量' })
  volumeMax: number;

  @ApiProperty({ description: '交易量步长' })
  volumeStep: number;

  @ApiPropertyOptional({ description: '基础货币' })
  currency?: string;

  @ApiPropertyOptional({ description: '盈利货币' })
  profitCurrency?: string;

  @ApiPropertyOptional({ description: '保证金货币' })
  marginCurrency?: string;

  @ApiPropertyOptional({ description: '交易模式' })
  tradeMode?: number;

  @ApiPropertyOptional({ description: '是否启用' })
  enabled?: boolean;
}

/**
 * 报价 DTO
 */
export class TradingQuoteDto {
  @ApiProperty({ description: '品种代码' })
  symbol: string;

  @ApiProperty({ description: '买价' })
  bid: number;

  @ApiProperty({ description: '卖价' })
  ask: number;

  @ApiProperty({ description: '点差' })
  spread: number;

  @ApiProperty({ description: '时间' })
  time: Date;

  @ApiPropertyOptional({ description: '最高价' })
  high?: number;

  @ApiPropertyOptional({ description: '最低价' })
  low?: number;

  @ApiPropertyOptional({ description: '成交量' })
  volume?: number;
}

/**
 * 服务器状态 DTO
 */
export class ServerStatusDto {
  @ApiProperty({ description: '是否在线' })
  online: boolean;

  @ApiProperty({ description: '服务器时间' })
  serverTime: Date;

  @ApiPropertyOptional({ description: '版本' })
  version?: string;

  @ApiPropertyOptional({ description: '连接用户数' })
  connectedUsers?: number;

  @ApiPropertyOptional({ description: '活跃持仓数' })
  activePositions?: number;
}

/**
 * 账户摘要 DTO
 */
export class AccountSummaryDto {
  @ApiPropertyOptional({ description: '用户信息' })
  user?: TradingUserDto;

  @ApiProperty({ description: '持仓数量' })
  positionsCount: number;

  @ApiProperty({ description: '总盈亏' })
  totalProfit: number;

  @ApiProperty({ description: '总交易量' })
  totalVolume: number;
}

/**
 * 持仓汇总 DTO
 */
export class PositionsSummaryDto {
  @ApiProperty({ description: '总持仓数' })
  totalPositions: number;

  @ApiProperty({ description: '总交易量' })
  totalVolume: number;

  @ApiProperty({ description: '总盈亏' })
  totalProfit: number;

  @ApiProperty({ description: '按品种分组统计' })
  bySymbol: SymbolSummaryDto[];
}

export class SymbolSummaryDto {
  @ApiProperty({ description: '品种' })
  symbol: string;

  @ApiProperty({ description: '数量' })
  count: number;

  @ApiProperty({ description: '盈亏' })
  profit: number;

  @ApiProperty({ description: '交易量' })
  volume: number;
}
