import { IsString, IsOptional, IsUrl, IsEnum, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { MiddlewareAssignmentMode, MiddlewareStatus, PlatformType } from '@prisma/client';

/**
 * 创建中间件 DTO
 */
export class CreateMiddlewareDto {
  @ApiProperty({ description: '中间件名称', example: 'Middleware-01' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '中间件描述', example: '主要用于小型租户' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '中间件 URL (可选，中间件注册时自动填充)', example: 'http://middleware-01:8080' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;

  @ApiPropertyOptional({ description: '服务器 IP 地址 (可选，中间件注册时自动填充)', example: '192.168.1.100' })
  @IsOptional()
  @IsString()
  serverIp?: string;

  @ApiPropertyOptional({
    description: '平台类型',
    enum: PlatformType,
    default: PlatformType.MT5,
  })
  @IsOptional()
  @IsEnum(PlatformType)
  platformType?: PlatformType;

  @ApiPropertyOptional({
    description: '分配模式',
    enum: MiddlewareAssignmentMode,
    default: MiddlewareAssignmentMode.SHARED,
  })
  @IsOptional()
  @IsEnum(MiddlewareAssignmentMode)
  assignmentMode?: MiddlewareAssignmentMode;

  @ApiPropertyOptional({
    description: '最大租户数 (仅 SHARED 模式)',
    example: 10,
    default: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxTenants?: number;
}

/**
 * 更新中间件 DTO
 */
export class UpdateMiddlewareDto extends PartialType(CreateMiddlewareDto) {}

/**
 * 中间件响应 DTO
 */
export class MiddlewareResponseDto {
  @ApiProperty({ description: '中间件 ID' })
  id: string;

  @ApiProperty({ description: '中间件名称' })
  name: string;

  @ApiPropertyOptional({ description: '中间件描述' })
  description?: string;

  @ApiProperty({ description: '中间件 URL' })
  url: string;

  @ApiProperty({ description: '平台类型', enum: PlatformType })
  platformType: PlatformType;

  @ApiProperty({ description: '分配模式', enum: MiddlewareAssignmentMode })
  assignmentMode: MiddlewareAssignmentMode;

  @ApiProperty({ description: '最大租户数' })
  maxTenants: number;

  @ApiProperty({ description: '当前状态', enum: MiddlewareStatus })
  status: MiddlewareStatus;

  @ApiPropertyOptional({ description: '最后心跳时间' })
  lastHeartbeat?: Date;

  @ApiPropertyOptional({ description: '服务器 IP' })
  serverIp?: string;

  @ApiProperty({ description: '活跃会话数' })
  activeSessions: number;

  @ApiPropertyOptional({ description: '内存使用量 (MB)' })
  memoryUsage?: number;

  @ApiPropertyOptional({ description: '内存总容量 (MB)' })
  memoryTotal?: number;

  @ApiPropertyOptional({ description: '内存使用率 (%)' })
  memoryUsagePercent?: number;

  @ApiPropertyOptional({ description: '系统级 CPU 使用率 (%)' })
  cpuUsage?: number;

  @ApiPropertyOptional({ description: '进程级 CPU 使用率 (%)' })
  processCpuUsage?: number;

  @ApiPropertyOptional({ description: '进程级内存使用量 (MB)' })
  processMemory?: number;

  @ApiPropertyOptional({ description: '硬盘使用量 (GB)' })
  diskUsage?: number;

  @ApiPropertyOptional({ description: '硬盘使用率 (%)' })
  diskUsagePercent?: number;

  @ApiPropertyOptional({ description: '硬盘总容量 (GB)' })
  diskTotal?: number;

  @ApiPropertyOptional({ description: '缓存状态' })
  cacheStatus?: Record<string, unknown>;

  @ApiProperty({ description: '已分配租户数' })
  assignedTenantCount: number;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}

/**
 * 中间件列表查询 DTO
 */
export class QueryMiddlewareDto {
  @ApiPropertyOptional({ description: '状态筛选', enum: MiddlewareStatus })
  @IsOptional()
  @IsEnum(MiddlewareStatus)
  status?: MiddlewareStatus;

  @ApiPropertyOptional({ description: '分配模式筛选', enum: MiddlewareAssignmentMode })
  @IsOptional()
  @IsEnum(MiddlewareAssignmentMode)
  assignmentMode?: MiddlewareAssignmentMode;

  @ApiPropertyOptional({ description: '名称搜索' })
  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * 中间件带注册密钥响应 DTO (仅创建时返回)
 */
export class MiddlewareWithApiKeyDto extends MiddlewareResponseDto {
  @ApiProperty({ description: '注册密钥 (仅创建时返回，请妥善保管，用于中间件启动参数 --secret)' })
  registrationSecret: string;
}

/**
 * 重新生成注册密钥响应 DTO
 */
export class RegenerateRegistrationSecretResponseDto {
  @ApiProperty({ description: '新的注册密钥' })
  registrationSecret: string;

  @ApiProperty({ description: '消息' })
  message: string;
}

/**
 * @deprecated 使用 RegenerateRegistrationSecretResponseDto 代替
 */
export class RegenerateApiKeyResponseDto extends RegenerateRegistrationSecretResponseDto {}
