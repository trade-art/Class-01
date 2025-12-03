import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 订单类型枚举
 */
export enum OrderType {
  BUY = 'buy',
  SELL = 'sell',
  BUY_LIMIT = 'buy_limit',
  SELL_LIMIT = 'sell_limit',
  BUY_STOP = 'buy_stop',
  SELL_STOP = 'sell_stop',
}

/**
 * 历史订单查询 DTO
 */
export class HistoryQueryDto {
  @ApiPropertyOptional({ description: '用户登录号' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  login?: number;

  @ApiPropertyOptional({ description: '交易品种' })
  @IsOptional()
  @IsString()
  symbol?: string;

  @ApiPropertyOptional({ description: '订单类型', enum: OrderType })
  @IsOptional()
  @IsEnum(OrderType)
  type?: OrderType;

  @ApiPropertyOptional({ description: '开始时间 (ISO 8601)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: '结束时间 (ISO 8601)' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ description: '最小盈亏' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minProfit?: number;

  @ApiPropertyOptional({ description: '最大盈亏' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxProfit?: number;

  @ApiPropertyOptional({ description: '排序字段' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: '排序方向', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({ description: '页码', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

/**
 * 历史订单 DTO
 */
export class HistoryOrderDto {
  @ApiProperty({ description: '订单号' })
  ticket: number;

  @ApiPropertyOptional({ description: '用户登录号' })
  login?: number;

  @ApiProperty({ description: '交易品种' })
  symbol: string;

  @ApiProperty({ description: '订单类型' })
  type: string;

  @ApiProperty({ description: '手数' })
  volume: number;

  @ApiProperty({ description: '开仓价格' })
  openPrice: number;

  @ApiProperty({ description: '平仓价格' })
  closePrice: number;

  @ApiProperty({ description: '止损价格' })
  sl: number;

  @ApiProperty({ description: '止盈价格' })
  tp: number;

  @ApiProperty({ description: '盈亏' })
  profit: number;

  @ApiProperty({ description: '手续费' })
  commission: number;

  @ApiProperty({ description: '库存费' })
  swap: number;

  @ApiProperty({ description: '开仓时间' })
  openTime: string;

  @ApiProperty({ description: '平仓时间' })
  closeTime: string;

  @ApiPropertyOptional({ description: '备注' })
  comment?: string;
}

/**
 * 历史订单列表响应 DTO
 */
export class HistoryListResponseDto {
  @ApiProperty({ description: '历史订单列表', type: [HistoryOrderDto] })
  orders: HistoryOrderDto[];

  @ApiProperty({ description: '总数' })
  total: number;

  @ApiProperty({ description: '当前页码' })
  page: number;

  @ApiProperty({ description: '每页数量' })
  limit: number;

  @ApiProperty({ description: '总页数' })
  totalPages: number;
}

/**
 * 历史统计 DTO
 */
export class HistoryStatsDto {
  @ApiProperty({ description: '总订单数' })
  totalOrders: number;

  @ApiProperty({ description: '总盈亏' })
  totalProfit: number;

  @ApiProperty({ description: '盈利订单数' })
  profitableOrders: number;

  @ApiProperty({ description: '亏损订单数' })
  losingOrders: number;

  @ApiProperty({ description: '胜率 (%)' })
  winRate: number;

  @ApiProperty({ description: '平均盈利' })
  avgProfit: number;

  @ApiProperty({ description: '平均亏损' })
  avgLoss: number;

  @ApiProperty({ description: '总手续费' })
  totalCommission: number;

  @ApiProperty({ description: '总库存费' })
  totalSwap: number;

  @ApiProperty({ description: '平均持仓时间 (秒)' })
  avgHoldingTime: number;

  @ApiProperty({ description: '最大单笔盈利' })
  maxProfit: number;

  @ApiProperty({ description: '最大单笔亏损' })
  maxLoss: number;
}

/**
 * 导出请求 DTO
 */
export class ExportHistoryDto extends HistoryQueryDto {
  @ApiPropertyOptional({ description: '导出格式', enum: ['csv', 'xlsx'], default: 'csv' })
  @IsOptional()
  @IsEnum(['csv', 'xlsx'])
  format?: 'csv' | 'xlsx' = 'csv';
}
