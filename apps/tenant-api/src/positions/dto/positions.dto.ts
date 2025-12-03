import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 持仓类型枚举
 */
export enum PositionType {
  BUY = 'buy',
  SELL = 'sell',
}

/**
 * 盈亏筛选枚举
 */
export enum ProfitFilter {
  PROFIT = 'profit',   // 盈利
  LOSS = 'loss',       // 亏损
  ALL = 'all',         // 全部
}

/**
 * 持仓列表查询 DTO
 */
export class PositionListQueryDto {
  @ApiPropertyOptional({ description: '用户登录号' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  login?: number;

  @ApiPropertyOptional({ description: '交易品种' })
  @IsOptional()
  @IsString()
  symbol?: string;

  @ApiPropertyOptional({ description: '持仓类型', enum: PositionType })
  @IsOptional()
  @IsEnum(PositionType)
  type?: PositionType;

  @ApiPropertyOptional({ description: '盈亏筛选', enum: ProfitFilter })
  @IsOptional()
  @IsEnum(ProfitFilter)
  profitFilter?: ProfitFilter;

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
 * 持仓信息 DTO
 */
export class PositionDto {
  @ApiProperty({ description: '持仓票号' })
  ticket: number;

  @ApiProperty({ description: '用户登录号' })
  login: number;

  @ApiProperty({ description: '交易品种' })
  symbol: string;

  @ApiProperty({ description: '持仓类型' })
  type: string;

  @ApiProperty({ description: '手数' })
  volume: number;

  @ApiProperty({ description: '开仓价格' })
  openPrice: number;

  @ApiProperty({ description: '当前价格' })
  currentPrice: number;

  @ApiProperty({ description: '止损价格' })
  sl: number;

  @ApiProperty({ description: '止盈价格' })
  tp: number;

  @ApiProperty({ description: '浮动盈亏' })
  profit: number;

  @ApiProperty({ description: '库存费' })
  swap: number;

  @ApiProperty({ description: '手续费' })
  commission: number;

  @ApiProperty({ description: '开仓时间' })
  openTime: string;

  @ApiPropertyOptional({ description: '备注' })
  comment?: string;
}

/**
 * 持仓列表响应 DTO
 */
export class PositionListResponseDto {
  @ApiProperty({ description: '持仓列表', type: [PositionDto] })
  positions: PositionDto[];

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
 * 持仓统计 DTO
 */
export class PositionStatsDto {
  @ApiProperty({ description: '总持仓数' })
  totalPositions: number;

  @ApiProperty({ description: '总手数' })
  totalVolume: number;

  @ApiProperty({ description: '总浮动盈亏' })
  totalProfit: number;

  @ApiProperty({ description: '多头持仓数' })
  buyCount: number;

  @ApiProperty({ description: '空头持仓数' })
  sellCount: number;

  @ApiProperty({ description: '多头手数' })
  buyVolume: number;

  @ApiProperty({ description: '空头手数' })
  sellVolume: number;

  @ApiProperty({ description: '多头盈亏' })
  buyProfit: number;

  @ApiProperty({ description: '空头盈亏' })
  sellProfit: number;

  @ApiProperty({ description: '多空比' })
  longShortRatio: number;
}

/**
 * 按品种统计 DTO
 */
export class SymbolPositionStatsDto {
  @ApiProperty({ description: '品种' })
  symbol: string;

  @ApiProperty({ description: '持仓数量' })
  count: number;

  @ApiProperty({ description: '总手数' })
  volume: number;

  @ApiProperty({ description: '总盈亏' })
  profit: number;

  @ApiProperty({ description: '多头数量' })
  buyCount: number;

  @ApiProperty({ description: '空头数量' })
  sellCount: number;
}
