import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsInt,
  IsEnum,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * 分页查询基础 DTO
 */
export class PaginationQueryDto {
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
  pageSize?: number = 20;
}

/**
 * 用户列表查询 DTO
 */
export class UsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '搜索关键词（登录号/姓名/邮箱）' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: '用户组' })
  @IsOptional()
  @IsString()
  group?: string;

  @ApiPropertyOptional({ description: '排序字段' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: '排序方向', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

/**
 * 持仓查询 DTO
 */
export class PositionsQueryDto {
  @ApiPropertyOptional({ description: '用户登录号' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  login?: number;

  @ApiPropertyOptional({ description: '品种代码' })
  @IsOptional()
  @IsString()
  symbol?: string;
}

/**
 * 订单查询 DTO
 */
export class OrdersQueryDto {
  @ApiPropertyOptional({ description: '用户登录号' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  login?: number;

  @ApiPropertyOptional({ description: '品种代码' })
  @IsOptional()
  @IsString()
  symbol?: string;

  @ApiPropertyOptional({ description: '订单状态' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  state?: number;
}

/**
 * 成交查询 DTO
 */
export class DealsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '用户登录号' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  login?: number;

  @ApiPropertyOptional({ description: '品种代码' })
  @IsOptional()
  @IsString()
  symbol?: string;

  @ApiPropertyOptional({ description: '开始时间' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: '结束时间' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

/**
 * 品种查询 DTO
 */
export class SymbolsQueryDto {
  @ApiPropertyOptional({ description: '搜索关键词' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: '品种分组' })
  @IsOptional()
  @IsString()
  group?: string;
}

/**
 * 批量报价查询 DTO
 */
export class QuotesQueryDto {
  @ApiProperty({ description: '品种代码列表（逗号分隔）' })
  @IsString()
  @Transform(({ value }) => value)
  symbols: string;
}

/**
 * 更新用户组 DTO
 */
export class UpdateUserGroupDto {
  @ApiProperty({ description: '新的用户组' })
  @IsString()
  group: string;
}
