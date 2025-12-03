import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsUUID,
  IsNumber,
  IsDate,
  IsArray,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 交易订单类型
 */
export enum OrderType {
  BUY = 'BUY',
  SELL = 'SELL',
  BUY_LIMIT = 'BUY_LIMIT',
  SELL_LIMIT = 'SELL_LIMIT',
  BUY_STOP = 'BUY_STOP',
  SELL_STOP = 'SELL_STOP',
}

/**
 * 订单状态
 */
export enum OrderStatus {
  PENDING = 'PENDING',
  FILLED = 'FILLED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

/**
 * 交易订单 DTO
 */
export class TradingOrderDto {
  @ApiProperty()
  ticket: number;

  @ApiProperty()
  login: number;

  @ApiProperty()
  symbol: string;

  @ApiProperty({ enum: OrderType })
  type: OrderType;

  @ApiProperty()
  volume: number;

  @ApiProperty()
  openPrice: number;

  @ApiPropertyOptional()
  closePrice?: number;

  @ApiPropertyOptional()
  stopLoss?: number;

  @ApiPropertyOptional()
  takeProfit?: number;

  @ApiProperty()
  openTime: Date;

  @ApiPropertyOptional()
  closeTime?: Date;

  @ApiProperty()
  profit: number;

  @ApiProperty()
  commission: number;

  @ApiProperty()
  swap: number;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiPropertyOptional()
  comment?: string;
}

/**
 * 交易历史查询 DTO
 */
export class TradingHistoryQueryDto {
  @ApiPropertyOptional({ description: 'Tenant ID' })
  @IsUUID()
  @IsOptional()
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Instance ID' })
  @IsUUID()
  @IsOptional()
  instanceId?: string;

  @ApiPropertyOptional({ description: '交易账号' })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  login?: number;

  @ApiPropertyOptional({ description: '交易品种' })
  @IsString()
  @IsOptional()
  symbol?: string;

  @ApiPropertyOptional({ enum: OrderType })
  @IsEnum(OrderType)
  @IsOptional()
  orderType?: OrderType;

  @ApiProperty({ description: '开始时间' })
  @IsDate()
  @Type(() => Date)
  @IsNotEmpty()
  fromDate: Date;

  @ApiProperty({ description: '结束时间' })
  @IsDate()
  @Type(() => Date)
  @IsNotEmpty()
  toDate: Date;

  @ApiPropertyOptional({ default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 50;
}

/**
 * 账户余额 DTO
 */
export class AccountBalanceDto {
  @ApiProperty()
  login: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  balance: number;

  @ApiProperty()
  equity: number;

  @ApiProperty()
  margin: number;

  @ApiProperty()
  freeMargin: number;

  @ApiProperty()
  marginLevel: number;

  @ApiProperty()
  leverage: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  profit: number;
}

/**
 * 交易统计 DTO
 */
export class TradingStatsDto {
  @ApiProperty()
  totalOrders: number;

  @ApiProperty()
  openOrders: number;

  @ApiProperty()
  closedOrders: number;

  @ApiProperty()
  totalVolume: number;

  @ApiProperty()
  totalProfit: number;

  @ApiProperty()
  totalCommission: number;

  @ApiProperty()
  totalSwap: number;

  @ApiProperty()
  winRate: number;

  @ApiProperty()
  averageProfit: number;

  @ApiProperty()
  averageLoss: number;

  @ApiProperty()
  profitFactor: number;

  @ApiProperty({ description: '按品种统计' })
  bySymbol: {
    symbol: string;
    orders: number;
    volume: number;
    profit: number;
  }[];

  @ApiProperty({ description: '按订单类型统计' })
  byType: {
    type: OrderType;
    orders: number;
    profit: number;
  }[];
}

/**
 * 租户交易概览 DTO
 */
export class TenantTradingOverviewDto {
  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  tenantName: string;

  @ApiProperty()
  totalAccounts: number;

  @ApiProperty()
  activeAccounts: number;

  @ApiProperty()
  totalBalance: number;

  @ApiProperty()
  totalEquity: number;

  @ApiProperty()
  todayOrders: number;

  @ApiProperty()
  todayVolume: number;

  @ApiProperty()
  todayProfit: number;

  @ApiProperty()
  instances: {
    id: string;
    name: string;
    status: string;
    accounts: number;
    todayOrders: number;
  }[];
}

/**
 * 实时持仓 DTO
 */
export class OpenPositionDto {
  @ApiProperty()
  ticket: number;

  @ApiProperty()
  login: number;

  @ApiProperty()
  symbol: string;

  @ApiProperty({ enum: OrderType })
  type: OrderType;

  @ApiProperty()
  volume: number;

  @ApiProperty()
  openPrice: number;

  @ApiProperty()
  currentPrice: number;

  @ApiProperty()
  stopLoss?: number;

  @ApiProperty()
  takeProfit?: number;

  @ApiProperty()
  openTime: Date;

  @ApiProperty()
  profit: number;

  @ApiProperty()
  swap: number;

  @ApiProperty()
  commission: number;
}

/**
 * 聚合查询响应
 */
export class AggregatedTradingDataDto {
  @ApiProperty({ description: '时间段' })
  period: string;

  @ApiProperty()
  orders: number;

  @ApiProperty()
  volume: number;

  @ApiProperty()
  profit: number;

  @ApiProperty()
  commission: number;
}
