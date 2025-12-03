import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, ArrayMinSize } from 'class-validator';

/**
 * 报价查询 DTO
 */
export class QuoteQueryDto {
  @ApiPropertyOptional({ description: '搜索关键词 (品种名称)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: '品种类型 (forex/indices/commodities/stocks)' })
  @IsOptional()
  @IsString()
  type?: string;
}

/**
 * 报价信息 DTO
 */
export class QuoteDto {
  @ApiProperty({ description: '品种名称' })
  symbol: string;

  @ApiProperty({ description: '买价' })
  bid: number;

  @ApiProperty({ description: '卖价' })
  ask: number;

  @ApiProperty({ description: '点差' })
  spread: number;

  @ApiProperty({ description: '最高价' })
  high: number;

  @ApiProperty({ description: '最低价' })
  low: number;

  @ApiProperty({ description: '成交量' })
  volume: number;

  @ApiProperty({ description: '更新时间' })
  time: string;

  @ApiPropertyOptional({ description: '变动百分比' })
  changePercent?: number;
}

/**
 * 品种信息 DTO
 */
export class SymbolInfoDto {
  @ApiProperty({ description: '品种名称' })
  symbol: string;

  @ApiProperty({ description: '描述' })
  description: string;

  @ApiProperty({ description: '小数位数' })
  digits: number;

  @ApiProperty({ description: '点值' })
  point: number;

  @ApiProperty({ description: '合约大小' })
  contractSize: number;

  @ApiProperty({ description: '最小交易量' })
  volumeMin: number;

  @ApiProperty({ description: '最大交易量' })
  volumeMax: number;

  @ApiProperty({ description: '交易量步进' })
  volumeStep: number;

  @ApiPropertyOptional({ description: '交易时段' })
  tradingHours?: string;
}

/**
 * 添加/移除自选 DTO
 */
export class FavoriteSymbolDto {
  @ApiProperty({ description: '品种名称' })
  @IsString()
  symbol: string;
}

/**
 * 批量添加自选 DTO
 */
export class BatchFavoriteSymbolDto {
  @ApiProperty({ description: '品种名称列表', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  symbols: string[];
}

/**
 * 自选品种 DTO
 */
export class FavoriteQuoteDto extends QuoteDto {
  @ApiProperty({ description: '排序顺序' })
  sortOrder: number;
}

/**
 * 自选列表响应 DTO
 */
export class FavoriteListResponseDto {
  @ApiProperty({ description: '自选列表', type: [FavoriteQuoteDto] })
  favorites: FavoriteQuoteDto[];

  @ApiProperty({ description: '总数' })
  total: number;
}
