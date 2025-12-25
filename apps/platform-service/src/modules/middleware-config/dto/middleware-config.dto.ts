import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsObject, Min, Max } from 'class-validator';

/**
 * MT 服务器配置 (用于中间件拉取配置)
 * 包含解密后的敏感信息
 */
export class MtServerConfigDto {
  @ApiProperty({ description: '服务器 ID' })
  id: string;

  @ApiProperty({ description: '服务器标识符' })
  serverId: string;

  @ApiPropertyOptional({ description: '显示名称' })
  displayName?: string;

  @ApiProperty({ description: '平台类型 (MT5/MT4)' })
  platformType: string;

  @ApiProperty({ description: '中间件 URL' })
  middlewareUrl: string;

  @ApiProperty({ description: 'MT 服务器地址' })
  serverAddress: string;

  @ApiProperty({ description: '管理员登录账号' })
  managerLogin: string;

  @ApiProperty({ description: '管理员密码 (解密后)' })
  managerPassword: string;

  @ApiProperty({ description: '是否启用' })
  isActive: boolean;

  @ApiProperty({ description: '是否默认服务器' })
  isDefault: boolean;

  @ApiProperty({ description: '配置版本号' })
  configVersion: number;

  @ApiProperty({ description: '最后修改时间' })
  lastModifiedAt: Date;
}

/**
 * 租户配置 (用于中间件拉取配置)
 */
export class TenantConfigDto {
  @ApiProperty({ description: '租户 ID' })
  tenantId: string;

  @ApiProperty({ description: '租户代码' })
  tenantCode: string;

  @ApiProperty({ description: '租户名称' })
  tenantName: string;

  @ApiProperty({ description: 'MT 服务器配置列表' })
  mtServers: MtServerConfigDto[];
}

/**
 * 中间件配置响应 (用于中间件拉取配置)
 */
export class MiddlewareConfigResponseDto {
  @ApiProperty({ description: '中间件 ID' })
  middlewareId: string;

  @ApiProperty({ description: '中间件名称' })
  middlewareName: string;

  @ApiProperty({ description: '配置版本' })
  configVersion: number;

  @ApiProperty({ description: '配置更新时间' })
  configUpdatedAt: Date;

  @ApiProperty({ description: '租户配置列表' })
  tenants: TenantConfigDto[];
}

/**
 * 心跳上报 DTO
 */
export class HeartbeatDto {
  @ApiPropertyOptional({ description: '服务器 IP 地址' })
  @IsOptional()
  @IsString()
  serverIp?: string;

  @ApiPropertyOptional({ description: '活跃会话数' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  activeSessions?: number;

  @ApiPropertyOptional({ description: '内存使用率 (%)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  memoryUsage?: number;

  @ApiPropertyOptional({ description: 'CPU 使用率 (%)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  cpuUsage?: number;

  @ApiPropertyOptional({ description: '缓存状态' })
  @IsOptional()
  @IsObject()
  cacheStatus?: {
    redisConnected?: boolean;
    hitRate?: number;
    totalKeys?: number;
  };

  @ApiPropertyOptional({ description: '健康状态 (healthy/degraded/unhealthy)' })
  @IsOptional()
  @IsString()
  status?: string;
}

/**
 * 心跳响应 DTO
 */
export class HeartbeatResponseDto {
  @ApiProperty({ description: '是否成功' })
  success: boolean;

  @ApiProperty({ description: '下次心跳间隔 (秒)' })
  nextHeartbeatInterval: number;

  @ApiPropertyOptional({ description: '配置是否有更新' })
  configUpdated?: boolean;

  @ApiPropertyOptional({ description: '新配置版本' })
  newConfigVersion?: number;
}
