import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  Min,
  Max,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 用户状态枚举
 */
export enum UserStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

/**
 * 用户列表查询 DTO
 */
export class UserListQueryDto {
  @ApiPropertyOptional({ description: '搜索关键词 (登录号/姓名/邮箱)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: '组别筛选' })
  @IsOptional()
  @IsString()
  group?: string;

  @ApiPropertyOptional({ description: '状态筛选', enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

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
 * 更新用户组别 DTO
 */
export class UpdateUserGroupDto {
  @ApiProperty({ description: '目标组别' })
  @IsString()
  group: string;
}

/**
 * 更新用户杠杆 DTO
 */
export class UpdateUserLeverageDto {
  @ApiProperty({ description: '杠杆倍数 (1-500)', minimum: 1, maximum: 500 })
  @IsNumber()
  @Min(1)
  @Max(500)
  leverage: number;
}

/**
 * 更新用户状态 DTO
 */
export class UpdateUserStatusDto {
  @ApiProperty({ description: '用户状态', enum: UserStatus })
  @IsEnum(UserStatus)
  status: UserStatus;
}

/**
 * 交易记录查询 DTO
 */
export class TransactionQueryDto {
  @ApiPropertyOptional({ description: '开始时间 (ISO 8601)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: '结束时间 (ISO 8601)' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ description: '类型 (deposit/withdraw)' })
  @IsOptional()
  @IsString()
  type?: string;

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
 * 操作日志查询 DTO
 */
export class LogQueryDto {
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
 * 导出请求 DTO
 */
export class ExportUsersDto {
  @ApiPropertyOptional({ description: '搜索关键词' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: '组别筛选' })
  @IsOptional()
  @IsString()
  group?: string;

  @ApiPropertyOptional({ description: '状态筛选', enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ description: '导出格式', enum: ['csv', 'xlsx'], default: 'csv' })
  @IsOptional()
  @IsEnum(['csv', 'xlsx'])
  format?: 'csv' | 'xlsx' = 'csv';
}

/**
 * 用户信息响应 DTO
 */
export class UserDto {
  @ApiProperty({ description: '登录号' })
  login: number;

  @ApiProperty({ description: '姓名' })
  name: string;

  @ApiPropertyOptional({ description: '邮箱' })
  email?: string;

  @ApiProperty({ description: '组别' })
  group: string;

  @ApiProperty({ description: '杠杆' })
  leverage: number;

  @ApiProperty({ description: '余额' })
  balance: number;

  @ApiProperty({ description: '净值' })
  equity: number;

  @ApiProperty({ description: '浮动盈亏' })
  profit: number;

  @ApiProperty({ description: '保证金' })
  margin: number;

  @ApiProperty({ description: '可用保证金' })
  freeMargin: number;

  @ApiProperty({ description: '状态' })
  status: string;

  @ApiProperty({ description: '注册时间' })
  registrationTime: string;

  @ApiPropertyOptional({ description: '最后登录时间' })
  lastAccessTime?: string;
}

/**
 * 用户详情响应 DTO
 */
export class UserDetailDto extends UserDto {
  @ApiPropertyOptional({ description: '电话' })
  phone?: string;

  @ApiPropertyOptional({ description: '国家' })
  country?: string;

  @ApiPropertyOptional({ description: '城市' })
  city?: string;

  @ApiPropertyOptional({ description: '地址' })
  address?: string;

  @ApiPropertyOptional({ description: '备注' })
  comment?: string;

  @ApiProperty({ description: '总入金' })
  totalDeposit: number;

  @ApiProperty({ description: '总出金' })
  totalWithdrawal: number;

  @ApiProperty({ description: '总订单数' })
  totalOrders: number;

  @ApiProperty({ description: '活跃持仓数' })
  activePositions: number;
}

/**
 * 用户组别 DTO
 */
export class UserGroupDto {
  @ApiProperty({ description: '组别名称' })
  name: string;

  @ApiProperty({ description: '组别描述' })
  description: string;

  @ApiProperty({ description: '用户数量' })
  userCount: number;
}

/**
 * 用户列表响应 DTO
 */
export class UserListResponseDto {
  @ApiProperty({ description: '用户列表', type: [UserDto] })
  users: UserDto[];

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
 * 交易记录 DTO
 */
export class TransactionDto {
  @ApiProperty({ description: '交易ID' })
  id: number;

  @ApiProperty({ description: '类型 (deposit/withdraw)' })
  type: string;

  @ApiProperty({ description: '金额' })
  amount: number;

  @ApiProperty({ description: '备注' })
  comment: string;

  @ApiProperty({ description: '时间' })
  time: string;
}

/**
 * 操作日志 DTO
 */
export class UserLogDto {
  @ApiProperty({ description: '日志ID' })
  id: number;

  @ApiProperty({ description: '操作类型' })
  action: string;

  @ApiProperty({ description: '详情' })
  details: string;

  @ApiProperty({ description: 'IP 地址' })
  ip: string;

  @ApiProperty({ description: '时间' })
  time: string;
}
