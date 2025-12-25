import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsIP,
  IsInt,
  IsDateString,
  MinLength,
  MaxLength,
  Min,
  Max,
  ArrayMaxSize,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationWithSearchDto } from '../../common/dto/pagination.dto';

// ============================================
// API Key Scopes Enum
// ============================================

/**
 * API Key 作用域枚举
 * 定义 API Key 可访问的资源范围
 */
export enum ApiKeyScope {
  /** 所有权限 */
  ALL = '*',
  /** 读取用户数据 */
  USERS_READ = 'users:read',
  /** 写入用户数据 */
  USERS_WRITE = 'users:write',
  /** 读取持仓数据 */
  POSITIONS_READ = 'positions:read',
  /** 读取交易历史 */
  HISTORY_READ = 'history:read',
  /** 读取报价数据 */
  QUOTES_READ = 'quotes:read',
  /** 执行交易操作 */
  TRADING_EXECUTE = 'trading:execute',
  /** 读取报表数据 */
  REPORTS_READ = 'reports:read',
  /** 读取风控数据 */
  RISK_READ = 'risk:read',
  /** 读取设置 */
  SETTINGS_READ = 'settings:read',
  /** 写入设置 */
  SETTINGS_WRITE = 'settings:write',
}

// ============================================
// Create API Key DTOs
// ============================================

/**
 * 创建 API Key DTO
 */
export class CreateApiKeyDto {
  @ApiProperty({
    description: 'API Key 名称',
    example: 'Production API Key',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: '作用域列表 (默认: ["*"] 表示所有权限)',
    example: ['users:read', 'positions:read'],
    type: [String],
    default: ['*'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  scopes?: string[];

  @ApiPropertyOptional({
    description: 'IP 白名单 (留空表示允许所有 IP)',
    example: ['192.168.1.1', '10.0.0.0/24'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  allowedIps?: string[];

  @ApiPropertyOptional({
    description: '关联的服务器 ID (可选，限制 Key 只能访问特定服务器)',
    example: 'srv_123',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  serverId?: string;

  @ApiPropertyOptional({
    description: '每分钟请求限制 (默认: 1000)',
    example: 1000,
    minimum: 1,
    maximum: 10000,
    default: 1000,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  @Type(() => Number)
  rateLimit?: number;

  @ApiPropertyOptional({
    description: '过期时间 (ISO 8601 格式，留空表示永不过期)',
    example: '2025-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

/**
 * 创建 API Key 响应 DTO
 * 注意: apiKey 字段仅在创建时返回一次，之后无法再获取
 */
export class CreateApiKeyResponseDto {
  @ApiProperty({ description: 'API Key ID' })
  id: string;

  @ApiProperty({ description: '名称' })
  name: string;

  @ApiProperty({
    description: '完整的 API Key (仅显示一次，请妥善保存)',
    example: 'mk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
  })
  apiKey: string;

  @ApiProperty({ description: 'Key 前缀 (用于识别)' })
  keyPrefix: string;

  @ApiProperty({ description: '作用域列表', type: [String] })
  scopes: string[];

  @ApiProperty({ description: 'IP 白名单', type: [String] })
  allowedIps: string[];

  @ApiPropertyOptional({ description: '关联的服务器 ID' })
  serverId?: string;

  @ApiProperty({ description: '每分钟请求限制' })
  rateLimit: number;

  @ApiPropertyOptional({ description: '过期时间' })
  expiresAt?: string;

  @ApiProperty({ description: '创建时间' })
  createdAt: string;
}

// ============================================
// Update API Key DTOs
// ============================================

/**
 * 更新 API Key DTO
 */
export class UpdateApiKeyDto {
  @ApiPropertyOptional({
    description: '新名称',
    example: 'Updated API Key Name',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: '更新 IP 白名单',
    example: ['192.168.1.1', '10.0.0.0/24'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  allowedIps?: string[];

  @ApiPropertyOptional({
    description: '更新作用域',
    example: ['users:read', 'positions:read'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  scopes?: string[];

  @ApiPropertyOptional({
    description: '更新每分钟请求限制',
    minimum: 1,
    maximum: 10000,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  @Type(() => Number)
  rateLimit?: number;
}

// ============================================
// Query API Key DTOs
// ============================================

/**
 * API Key 查询 DTO
 */
export class ApiKeyQueryDto extends PaginationWithSearchDto {
  @ApiPropertyOptional({
    description: '过滤状态 (active/revoked/expired/all)',
    enum: ['active', 'revoked', 'expired', 'all'],
    default: 'active',
  })
  @IsOptional()
  @IsString()
  status?: 'active' | 'revoked' | 'expired' | 'all';

  @ApiPropertyOptional({
    description: '过滤关联的服务器 ID',
  })
  @IsOptional()
  @IsString()
  serverId?: string;
}

// ============================================
// API Key Response DTOs
// ============================================

/**
 * API Key 列表项 DTO
 */
export class ApiKeyListItemDto {
  @ApiProperty({ description: 'API Key ID' })
  id: string;

  @ApiProperty({ description: '名称' })
  name: string;

  @ApiProperty({ description: 'Key 前缀 (用于识别)' })
  keyPrefix: string;

  @ApiProperty({ description: '作用域列表', type: [String] })
  scopes: string[];

  @ApiProperty({ description: 'IP 白名单', type: [String] })
  allowedIps: string[];

  @ApiPropertyOptional({ description: '关联的服务器 ID' })
  serverId?: string;

  @ApiProperty({ description: '每分钟请求限制' })
  rateLimit: number;

  @ApiProperty({ description: '使用次数' })
  usageCount: number;

  @ApiPropertyOptional({ description: '最后使用时间' })
  lastUsedAt?: string;

  @ApiPropertyOptional({ description: '最后使用 IP' })
  lastUsedIp?: string;

  @ApiProperty({ description: '是否激活' })
  isActive: boolean;

  @ApiPropertyOptional({ description: '撤销时间' })
  revokedAt?: string;

  @ApiPropertyOptional({ description: '撤销人' })
  revokedBy?: string;

  @ApiPropertyOptional({ description: '过期时间' })
  expiresAt?: string;

  @ApiPropertyOptional({ description: '创建人' })
  createdBy?: string;

  @ApiProperty({ description: '创建时间' })
  createdAt: string;

  @ApiProperty({ description: '更新时间' })
  updatedAt: string;
}

/**
 * API Key 列表响应 DTO
 */
export class ApiKeyListResponseDto {
  @ApiProperty({ description: 'API Key 列表', type: [ApiKeyListItemDto] })
  items: ApiKeyListItemDto[];

  @ApiProperty({ description: '总数' })
  total: number;

  @ApiProperty({ description: '当前页码' })
  page: number;

  @ApiProperty({ description: '每页数量' })
  pageSize: number;
}

/**
 * API Key 详情响应 DTO
 */
export class ApiKeyDetailDto extends ApiKeyListItemDto {
  @ApiProperty({ description: '租户 ID' })
  tenantId: string;
}

// ============================================
// Internal Validation DTOs
// ============================================

/**
 * 验证 API Key 请求 DTO (供中间件内部调用)
 */
export class ValidateApiKeyDto {
  @ApiProperty({
    description: 'API Key (完整密钥)',
    example: 'mk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
  })
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  apiKey: string;

  @ApiPropertyOptional({
    description: '请求所需的作用域',
    example: ['users:read'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredScopes?: string[];

  @ApiPropertyOptional({
    description: '请求来源 IP',
    example: '192.168.1.100',
  })
  @IsOptional()
  @IsString()
  clientIp?: string;
}

/**
 * 验证 API Key 响应 DTO
 */
export class ValidateApiKeyResponseDto {
  @ApiProperty({ description: '验证是否通过' })
  valid: boolean;

  @ApiPropertyOptional({ description: 'API Key ID (验证通过时返回)' })
  keyId?: string;

  @ApiPropertyOptional({ description: '租户 ID (验证通过时返回)' })
  tenantId?: string;

  @ApiPropertyOptional({ description: '关联的服务器 ID (验证通过时返回)' })
  serverId?: string;

  @ApiPropertyOptional({ description: 'Key 的作用域列表 (验证通过时返回)', type: [String] })
  scopes?: string[];

  @ApiPropertyOptional({ description: '剩余速率限制配额' })
  remainingRateLimit?: number;

  @ApiPropertyOptional({ description: '验证失败原因 (验证失败时返回)' })
  reason?: string;

  @ApiPropertyOptional({
    description: '失败错误码',
    enum: ['INVALID_KEY', 'EXPIRED', 'REVOKED', 'IP_NOT_ALLOWED', 'SCOPE_DENIED', 'RATE_LIMITED'],
  })
  errorCode?: string;
}

// ============================================
// Revoke API Key DTOs
// ============================================

/**
 * 撤销 API Key 请求 DTO
 */
export class RevokeApiKeyDto {
  @ApiPropertyOptional({
    description: '撤销原因',
    example: 'Security breach detected',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
