import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator';

/**
 * 中间件运行时配置 DTO
 */
export class MiddlewareConfigDto {
  @ApiProperty({ description: '配置 ID' })
  id: string;

  @ApiProperty({ description: '中间件 ID' })
  middlewareId: string;

  // Rate Limit
  @ApiProperty({ description: '启用速率限制', default: true })
  rateLimitEnabled: boolean;

  @ApiProperty({ description: '每分钟请求数限制', default: 60 })
  rateLimitRequestsPerMin: number;

  @ApiProperty({ description: '突发请求数限制', default: 100 })
  rateLimitBurstSize: number;

  // Circuit Breaker
  @ApiProperty({ description: '启用熔断器', default: true })
  circuitBreakerEnabled: boolean;

  @ApiProperty({ description: '熔断器失败阈值', default: 5 })
  circuitBreakerFailureThreshold: number;

  @ApiProperty({ description: '熔断器打开超时(秒)', default: 30 })
  circuitBreakerOpenTimeoutSec: number;

  @ApiProperty({ description: '半开状态请求数', default: 3 })
  circuitBreakerHalfOpenRequests: number;

  // Retry
  @ApiProperty({ description: '启用重试', default: true })
  retryEnabled: boolean;

  @ApiProperty({ description: '最大重试次数', default: 3 })
  retryMaxRetries: number;

  @ApiProperty({ description: '重试基础延迟(毫秒)', default: 1000 })
  retryBaseDelayMs: number;

  @ApiProperty({ description: '重试最大延迟(毫秒)', default: 10000 })
  retryMaxDelayMs: number;

  // Cache TTL
  @ApiProperty({ description: '用户缓存TTL(秒)', default: 300 })
  cacheUserTtl: number;

  @ApiProperty({ description: '行情缓存TTL(秒)', default: 1 })
  cacheQuoteTtl: number;

  @ApiProperty({ description: '余额缓存TTL(秒)', default: 5 })
  cacheBalanceTtl: number;

  @ApiProperty({ description: '交易品种缓存TTL(秒)', default: 86400 })
  cacheSymbolTtl: number;

  @ApiProperty({ description: 'K线缓存TTL(秒)', default: 60 })
  cacheBarsTtl: number;

  // WebSocket
  @ApiProperty({ description: 'WebSocket心跳间隔(秒)', default: 30 })
  wsHeartbeatIntervalSec: number;

  @ApiProperty({ description: 'WebSocket Ping超时(秒)', default: 10 })
  wsPingTimeoutSec: number;

  @ApiProperty({ description: 'WebSocket最大连接数', default: 10000 })
  wsMaxConnections: number;

  // CORS
  @ApiProperty({ description: '启用CORS', default: true })
  corsEnabled: boolean;

  @ApiProperty({ description: '允许的来源', default: '*' })
  corsAllowedOrigins: string;

  @ApiProperty({ description: '允许的方法', default: 'GET,POST,PUT,DELETE,OPTIONS' })
  corsAllowedMethods: string;

  // Security
  @ApiProperty({ description: '最大登录尝试次数', default: 5 })
  securityMaxLoginAttempts: number;

  @ApiProperty({ description: '锁定时长(分钟)', default: 30 })
  securityLockoutDurationMin: number;

  @ApiProperty({ description: '会话超时(分钟)', default: 30 })
  securitySessionTimeoutMin: number;

  // Request Queue
  @ApiProperty({ description: '启用请求队列', default: true })
  requestQueueEnabled: boolean;

  @ApiProperty({ description: '请求队列最大大小', default: 1000 })
  requestQueueMaxSize: number;

  @ApiProperty({ description: '请求队列超时(毫秒)', default: 30000 })
  requestQueueTimeoutMs: number;

  @ApiProperty({ description: '请求队列工作线程数', default: 4 })
  requestQueueWorkerCount: number;

  // Batch
  @ApiProperty({ description: '批量并发限制', default: 10 })
  batchConcurrencyLimit: number;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}

/**
 * 更新中间件配置 DTO
 */
export class UpdateMiddlewareConfigDto {
  // Rate Limit
  @ApiPropertyOptional({ description: '启用速率限制' })
  @IsOptional()
  @IsBoolean()
  rateLimitEnabled?: boolean;

  @ApiPropertyOptional({ description: '每分钟请求数限制' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  rateLimitRequestsPerMin?: number;

  @ApiPropertyOptional({ description: '突发请求数限制' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  rateLimitBurstSize?: number;

  // Circuit Breaker
  @ApiPropertyOptional({ description: '启用熔断器' })
  @IsOptional()
  @IsBoolean()
  circuitBreakerEnabled?: boolean;

  @ApiPropertyOptional({ description: '熔断器失败阈值' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  circuitBreakerFailureThreshold?: number;

  @ApiPropertyOptional({ description: '熔断器打开超时(秒)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3600)
  circuitBreakerOpenTimeoutSec?: number;

  @ApiPropertyOptional({ description: '半开状态请求数' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  circuitBreakerHalfOpenRequests?: number;

  // Retry
  @ApiPropertyOptional({ description: '启用重试' })
  @IsOptional()
  @IsBoolean()
  retryEnabled?: boolean;

  @ApiPropertyOptional({ description: '最大重试次数' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  retryMaxRetries?: number;

  @ApiPropertyOptional({ description: '重试基础延迟(毫秒)' })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(60000)
  retryBaseDelayMs?: number;

  @ApiPropertyOptional({ description: '重试最大延迟(毫秒)' })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(300000)
  retryMaxDelayMs?: number;

  // Cache TTL
  @ApiPropertyOptional({ description: '用户缓存TTL(秒)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86400)
  cacheUserTtl?: number;

  @ApiPropertyOptional({ description: '行情缓存TTL(秒)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  cacheQuoteTtl?: number;

  @ApiPropertyOptional({ description: '余额缓存TTL(秒)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  cacheBalanceTtl?: number;

  @ApiPropertyOptional({ description: '交易品种缓存TTL(秒)' })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(604800)
  cacheSymbolTtl?: number;

  @ApiPropertyOptional({ description: 'K线缓存TTL(秒)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3600)
  cacheBarsTtl?: number;

  // WebSocket
  @ApiPropertyOptional({ description: 'WebSocket心跳间隔(秒)' })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  wsHeartbeatIntervalSec?: number;

  @ApiPropertyOptional({ description: 'WebSocket Ping超时(秒)' })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60)
  wsPingTimeoutSec?: number;

  @ApiPropertyOptional({ description: 'WebSocket最大连接数' })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(100000)
  wsMaxConnections?: number;

  // CORS
  @ApiPropertyOptional({ description: '启用CORS' })
  @IsOptional()
  @IsBoolean()
  corsEnabled?: boolean;

  @ApiPropertyOptional({ description: '允许的来源(逗号分隔)' })
  @IsOptional()
  @IsString()
  corsAllowedOrigins?: string;

  @ApiPropertyOptional({ description: '允许的方法(逗号分隔)' })
  @IsOptional()
  @IsString()
  corsAllowedMethods?: string;

  // Security
  @ApiPropertyOptional({ description: '最大登录尝试次数' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  securityMaxLoginAttempts?: number;

  @ApiPropertyOptional({ description: '锁定时长(分钟)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  securityLockoutDurationMin?: number;

  @ApiPropertyOptional({ description: '会话超时(分钟)' })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  securitySessionTimeoutMin?: number;

  // Request Queue
  @ApiPropertyOptional({ description: '启用请求队列' })
  @IsOptional()
  @IsBoolean()
  requestQueueEnabled?: boolean;

  @ApiPropertyOptional({ description: '请求队列最大大小' })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(100000)
  requestQueueMaxSize?: number;

  @ApiPropertyOptional({ description: '请求队列超时(毫秒)' })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(300000)
  requestQueueTimeoutMs?: number;

  @ApiPropertyOptional({ description: '请求队列工作线程数' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32)
  requestQueueWorkerCount?: number;

  // Batch
  @ApiPropertyOptional({ description: '批量并发限制' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  batchConcurrencyLimit?: number;
}
