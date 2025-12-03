import { IsString, IsOptional, IsNumber, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 中间件响应基础结构
 */
export class MiddlewareResponse<T = unknown> {
  @ApiProperty({ description: '是否成功' })
  success: boolean;

  @ApiProperty({ description: '响应数据' })
  data?: T;

  @ApiPropertyOptional({ description: '错误信息' })
  message?: string;

  @ApiPropertyOptional({ description: '错误代码' })
  code?: string;
}

/**
 * MT5 实例信息
 */
export class MT5InstanceDto {
  @ApiProperty({ description: '实例 ID' })
  instanceId: string;

  @ApiProperty({ description: '服务器地址' })
  server: string;

  @ApiProperty({ description: '连接状态' })
  connected: boolean;

  @ApiPropertyOptional({ description: '最后同步时间' })
  lastSync?: string;
}

/**
 * 账户信息 DTO
 */
export class AccountInfoDto {
  @ApiProperty({ description: '账户登录号' })
  login: number;

  @ApiProperty({ description: '账户名称' })
  name: string;

  @ApiProperty({ description: '账户余额' })
  balance: number;

  @ApiProperty({ description: '账户净值' })
  equity: number;

  @ApiProperty({ description: '已用保证金' })
  margin: number;

  @ApiProperty({ description: '可用保证金' })
  freeMargin: number;

  @ApiProperty({ description: '保证金水平' })
  marginLevel: number;

  @ApiProperty({ description: '杠杆比例' })
  leverage: number;

  @ApiProperty({ description: '账户货币' })
  currency: string;

  @ApiPropertyOptional({ description: '账户类型' })
  accountType?: string;
}

/**
 * 持仓信息 DTO
 */
export class PositionDto {
  @ApiProperty({ description: '持仓票据号' })
  ticket: number;

  @ApiProperty({ description: '交易品种' })
  symbol: string;

  @ApiProperty({ description: '持仓类型: buy/sell' })
  type: string;

  @ApiProperty({ description: '持仓手数' })
  volume: number;

  @ApiProperty({ description: '开仓价格' })
  openPrice: number;

  @ApiProperty({ description: '当前价格' })
  currentPrice: number;

  @ApiProperty({ description: '止损价' })
  stopLoss: number;

  @ApiProperty({ description: '止盈价' })
  takeProfit: number;

  @ApiProperty({ description: '浮动盈亏' })
  profit: number;

  @ApiProperty({ description: '持仓时间' })
  openTime: string;

  @ApiPropertyOptional({ description: '注释' })
  comment?: string;

  @ApiPropertyOptional({ description: '魔术号' })
  magic?: number;
}

/**
 * 报价信息 DTO
 */
export class QuoteDto {
  @ApiProperty({ description: '交易品种' })
  symbol: string;

  @ApiProperty({ description: '买入价' })
  bid: number;

  @ApiProperty({ description: '卖出价' })
  ask: number;

  @ApiProperty({ description: '点差' })
  spread: number;

  @ApiProperty({ description: '最高价' })
  high: number;

  @ApiProperty({ description: '最低价' })
  low: number;

  @ApiProperty({ description: '报价时间' })
  time: string;

  @ApiPropertyOptional({ description: '小数位数' })
  digits?: number;
}

/**
 * 品种信息 DTO
 */
export class SymbolDto {
  @ApiProperty({ description: '品种名称' })
  symbol: string;

  @ApiProperty({ description: '描述' })
  description: string;

  @ApiProperty({ description: '合约大小' })
  contractSize: number;

  @ApiProperty({ description: '最小交易量' })
  minVolume: number;

  @ApiProperty({ description: '最大交易量' })
  maxVolume: number;

  @ApiProperty({ description: '交易量步长' })
  volumeStep: number;

  @ApiProperty({ description: '点值' })
  point: number;

  @ApiProperty({ description: '小数位数' })
  digits: number;

  @ApiPropertyOptional({ description: '交易时段' })
  tradingHours?: string;
}

/**
 * 交易历史 DTO
 */
export class DealDto {
  @ApiProperty({ description: '订单号' })
  ticket: number;

  @ApiProperty({ description: '交易品种' })
  symbol: string;

  @ApiProperty({ description: '交易类型' })
  type: string;

  @ApiProperty({ description: '交易量' })
  volume: number;

  @ApiProperty({ description: '成交价格' })
  price: number;

  @ApiProperty({ description: '盈亏' })
  profit: number;

  @ApiProperty({ description: '手续费' })
  commission: number;

  @ApiProperty({ description: '库存费' })
  swap: number;

  @ApiProperty({ description: '成交时间' })
  time: string;

  @ApiPropertyOptional({ description: '注释' })
  comment?: string;
}

/**
 * 订单信息 DTO
 */
export class OrderDto {
  @ApiProperty({ description: '订单号' })
  ticket: number;

  @ApiProperty({ description: '交易品种' })
  symbol: string;

  @ApiProperty({ description: '订单类型' })
  type: string;

  @ApiProperty({ description: '订单量' })
  volume: number;

  @ApiProperty({ description: '开仓价格' })
  openPrice: number;

  @ApiProperty({ description: '止损价' })
  stopLoss: number;

  @ApiProperty({ description: '止盈价' })
  takeProfit: number;

  @ApiProperty({ description: '订单状态' })
  state: string;

  @ApiProperty({ description: '创建时间' })
  time: string;

  @ApiPropertyOptional({ description: '过期时间' })
  expiration?: string;

  @ApiPropertyOptional({ description: '注释' })
  comment?: string;
}

/**
 * 查询历史请求 DTO
 */
export class GetHistoryDto {
  @ApiPropertyOptional({ description: '开始日期 (ISO 格式)' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: '结束日期 (ISO 格式)' })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ description: '交易品种过滤' })
  @IsString()
  @IsOptional()
  symbol?: string;

  @ApiPropertyOptional({ description: '页码' })
  @IsNumber()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: '每页数量' })
  @IsNumber()
  @IsOptional()
  limit?: number;
}

/**
 * 服务器状态 DTO
 */
export class ServerStatusDto {
  @ApiProperty({ description: '服务器名称' })
  serverName: string;

  @ApiProperty({ description: '连接状态' })
  connected: boolean;

  @ApiProperty({ description: 'Ping 延迟 (ms)' })
  ping: number;

  @ApiProperty({ description: '服务器时间' })
  serverTime: string;

  @ApiProperty({ description: '交易会话状态' })
  tradeSession: string;
}
