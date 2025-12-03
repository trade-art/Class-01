import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 预警类型枚举
 */
export enum RiskAlertType {
  LARGE_TRADE = 'LARGE_TRADE',
  LOW_MARGIN = 'LOW_MARGIN',
  HIGH_FREQUENCY = 'HIGH_FREQUENCY',
  ABNORMAL_PROFIT = 'ABNORMAL_PROFIT',
}

/**
 * 预警级别枚举
 */
export enum RiskAlertLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

/**
 * 预警查询 DTO
 */
export class RiskAlertQueryDto {
  @ApiPropertyOptional({ description: '预警类型', enum: RiskAlertType })
  @IsOptional()
  @IsEnum(RiskAlertType)
  type?: RiskAlertType;

  @ApiPropertyOptional({ description: '预警级别', enum: RiskAlertLevel })
  @IsOptional()
  @IsEnum(RiskAlertLevel)
  level?: RiskAlertLevel;

  @ApiPropertyOptional({ description: '是否已读' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isRead?: boolean;

  @ApiPropertyOptional({ description: '开始时间 (ISO 8601)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: '结束时间 (ISO 8601)' })
  @IsOptional()
  @IsString()
  to?: string;

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
 * 预警 DTO
 */
export class RiskAlertDto {
  @ApiProperty({ description: '预警 ID' })
  id: string;

  @ApiProperty({ description: '预警类型', enum: RiskAlertType })
  type: RiskAlertType;

  @ApiProperty({ description: '预警级别', enum: RiskAlertLevel })
  level: RiskAlertLevel;

  @ApiProperty({ description: '预警消息' })
  message: string;

  @ApiPropertyOptional({ description: '预警数据' })
  data?: Record<string, unknown>;

  @ApiProperty({ description: '是否已读' })
  isRead: boolean;

  @ApiProperty({ description: '创建时间' })
  createdAt: string;
}

/**
 * 预警列表响应 DTO
 */
export class RiskAlertListResponseDto {
  @ApiProperty({ description: '预警列表', type: [RiskAlertDto] })
  alerts: RiskAlertDto[];

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
 * 风控配置 DTO
 */
export class RiskConfigDto {
  @ApiProperty({ description: '大额交易阈值' })
  largeTradeThreshold: number;

  @ApiProperty({ description: '低保证金阈值 (%)' })
  lowMarginThreshold: number;

  @ApiProperty({ description: '高频交易限制 (每分钟)' })
  highFrequencyLimit: number;

  @ApiProperty({ description: '是否启用风控' })
  isEnabled: boolean;
}

/**
 * 更新风控配置 DTO
 */
export class UpdateRiskConfigDto {
  @ApiPropertyOptional({ description: '大额交易阈值' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  largeTradeThreshold?: number;

  @ApiPropertyOptional({ description: '低保证金阈值 (%)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  lowMarginThreshold?: number;

  @ApiPropertyOptional({ description: '高频交易限制 (每分钟)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  highFrequencyLimit?: number;

  @ApiPropertyOptional({ description: '是否启用风控' })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

/**
 * 标记预警已读 DTO
 */
export class MarkAlertReadDto {
  @ApiProperty({ description: '预警 ID 列表', type: [String] })
  @IsString({ each: true })
  alertIds: string[];
}

/**
 * 风控统计 DTO
 */
export class RiskStatsDto {
  @ApiProperty({ description: '今日预警总数' })
  todayTotal: number;

  @ApiProperty({ description: '未读预警数' })
  unreadCount: number;

  @ApiProperty({ description: '危险级别预警数' })
  criticalCount: number;

  @ApiProperty({ description: '警告级别预警数' })
  warningCount: number;

  @ApiProperty({ description: '信息级别预警数' })
  infoCount: number;
}
