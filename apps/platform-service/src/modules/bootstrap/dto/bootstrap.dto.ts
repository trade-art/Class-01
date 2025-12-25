import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsObject,
  Min,
  Max,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================
// 中间件注册请求
// ============================================

/**
 * 中间件注册请求 DTO
 * 首次启动时用于注册并获取 API Key
 *
 * 注意: 只需要 registrationSecret 即可识别中间件
 */
export class RegisterMiddlewareDto {
  @ApiProperty({ description: '注册密钥 (唯一，由平台管理后台生成)', example: 'reg_xxxxxxxxxxxx' })
  @IsString()
  @IsNotEmpty()
  registrationSecret: string;

  @ApiPropertyOptional({ description: '服务器 IP 地址' })
  @IsOptional()
  @IsString()
  serverIp?: string;

  @ApiPropertyOptional({ description: '监听端口', default: 8083 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(65535)
  listenPort?: number;

  @ApiPropertyOptional({ description: '中间件版本', example: '1.0.0' })
  @IsOptional()
  @IsString()
  version?: string;
}

/**
 * 中间件注册响应 DTO
 */
export class RegisterMiddlewareResponseDto {
  @ApiProperty({ description: '是否成功' })
  success: boolean;

  @ApiProperty({ description: '中间件 ID' })
  middlewareId: string;

  @ApiProperty({ description: '中间件名称' })
  middlewareName: string;

  @ApiProperty({ description: 'API Key (用于后续请求认证)' })
  apiKey: string;

  @ApiProperty({ description: '心跳间隔 (秒)', default: 30 })
  heartbeatInterval: number;

  @ApiProperty({ description: '配置拉取间隔 (秒)', default: 60 })
  configPollInterval: number;
}

// ============================================
// 引导配置响应 (完整启动配置)
// ============================================

/**
 * Redis 配置
 */
export class RedisConfigDto {
  @ApiProperty({ description: 'Redis 主机' })
  host: string;

  @ApiProperty({ description: 'Redis 端口' })
  port: number;

  @ApiPropertyOptional({ description: 'Redis 密码' })
  password?: string;

  @ApiProperty({ description: 'Redis 数据库编号', default: 0 })
  db: number;

  @ApiProperty({ description: '连接池大小', default: 10 })
  poolSize: number;
}

/**
 * 数据库配置
 */
export class DatabaseConfigDto {
  @ApiProperty({ description: '数据库主机' })
  host: string;

  @ApiProperty({ description: '数据库端口' })
  port: number;

  @ApiProperty({ description: '数据库名称' })
  dbname: string;

  @ApiProperty({ description: '数据库用户' })
  user: string;

  @ApiProperty({ description: '数据库密码' })
  password: string;

  @ApiProperty({ description: '连接数', default: 10 })
  connectionNumber: number;
}

/**
 * JWT 配置
 */
export class JwtConfigDto {
  @ApiProperty({ description: 'JWT 密钥' })
  secret: string;

  @ApiProperty({ description: '签发者', default: 'mt5-middleware' })
  issuer: string;

  @ApiProperty({ description: '访问令牌过期时间 (秒)', default: 7200 })
  expireSeconds: number;

  @ApiProperty({ description: '刷新令牌过期时间 (秒)', default: 604800 })
  refreshExpireSeconds: number;
}

/**
 * 加密配置
 */
export class EncryptionConfigDto {
  @ApiProperty({ description: '主密钥 (用于解密存储的凭据)' })
  masterKey: string;

  @ApiProperty({ description: '加密算法', default: 'AES-256-GCM' })
  algorithm: string;
}

/**
 * 缓存 TTL 配置
 */
export class CacheConfigDto {
  @ApiProperty({ description: '用户信息 TTL (秒)', default: 300 })
  userTtl: number;

  @ApiProperty({ description: '报价 TTL (秒)', default: 1 })
  quoteTtl: number;

  @ApiProperty({ description: '余额 TTL (秒)', default: 5 })
  balanceTtl: number;

  @ApiProperty({ description: '品种 TTL (秒)', default: 86400 })
  symbolTtl: number;

  @ApiProperty({ description: 'K线 TTL (秒)', default: 60 })
  barsTtl: number;
}

/**
 * 速率限制配置
 */
export class RateLimitConfigDto {
  @ApiProperty({ description: '启用速率限制', default: true })
  enabled: boolean;

  @ApiProperty({ description: '每分钟请求数限制', default: 60 })
  requestsPerMin: number;

  @ApiProperty({ description: '突发请求数限制', default: 100 })
  burstSize: number;
}

/**
 * 熔断器配置
 */
export class CircuitBreakerConfigDto {
  @ApiProperty({ description: '启用熔断器', default: true })
  enabled: boolean;

  @ApiProperty({ description: '失败阈值', default: 5 })
  failureThreshold: number;

  @ApiProperty({ description: '打开超时(秒)', default: 30 })
  openTimeoutSec: number;

  @ApiProperty({ description: '半开状态请求数', default: 3 })
  halfOpenRequests: number;
}

/**
 * 重试配置
 */
export class RetryConfigDto {
  @ApiProperty({ description: '启用重试', default: true })
  enabled: boolean;

  @ApiProperty({ description: '最大重试次数', default: 3 })
  maxRetries: number;

  @ApiProperty({ description: '基础延迟(毫秒)', default: 1000 })
  baseDelayMs: number;

  @ApiProperty({ description: '最大延迟(毫秒)', default: 10000 })
  maxDelayMs: number;
}

/**
 * WebSocket 配置
 */
export class WebSocketConfigDto {
  @ApiProperty({ description: '心跳间隔(秒)', default: 30 })
  heartbeatIntervalSec: number;

  @ApiProperty({ description: 'Ping超时(秒)', default: 10 })
  pingTimeoutSec: number;

  @ApiProperty({ description: '最大连接数', default: 10000 })
  maxConnections: number;
}

/**
 * CORS 配置
 */
export class CorsConfigDto {
  @ApiProperty({ description: '启用CORS', default: true })
  enabled: boolean;

  @ApiProperty({ description: '允许的来源', default: '*' })
  allowedOrigins: string;

  @ApiProperty({ description: '允许的方法', default: 'GET,POST,PUT,DELETE,OPTIONS' })
  allowedMethods: string;
}

/**
 * 安全配置
 */
export class SecurityConfigDto {
  @ApiProperty({ description: '最大登录尝试次数', default: 5 })
  maxLoginAttempts: number;

  @ApiProperty({ description: '锁定时长(分钟)', default: 30 })
  lockoutDurationMin: number;

  @ApiProperty({ description: '会话超时(分钟)', default: 30 })
  sessionTimeoutMin: number;
}

/**
 * 请求队列配置
 */
export class RequestQueueConfigDto {
  @ApiProperty({ description: '启用请求队列', default: true })
  enabled: boolean;

  @ApiProperty({ description: '队列最大大小', default: 1000 })
  maxSize: number;

  @ApiProperty({ description: '超时(毫秒)', default: 30000 })
  timeoutMs: number;

  @ApiProperty({ description: '工作线程数', default: 4 })
  workerCount: number;
}

/**
 * 运行时配置 (从数据库加载，可在平台后台动态调整)
 */
export class RuntimeConfigDto {
  @ApiProperty({ description: '速率限制配置', type: RateLimitConfigDto })
  @ValidateNested()
  @Type(() => RateLimitConfigDto)
  rateLimit: RateLimitConfigDto;

  @ApiProperty({ description: '熔断器配置', type: CircuitBreakerConfigDto })
  @ValidateNested()
  @Type(() => CircuitBreakerConfigDto)
  circuitBreaker: CircuitBreakerConfigDto;

  @ApiProperty({ description: '重试配置', type: RetryConfigDto })
  @ValidateNested()
  @Type(() => RetryConfigDto)
  retry: RetryConfigDto;

  @ApiProperty({ description: '缓存配置', type: CacheConfigDto })
  @ValidateNested()
  @Type(() => CacheConfigDto)
  cache: CacheConfigDto;

  @ApiProperty({ description: 'WebSocket 配置', type: WebSocketConfigDto })
  @ValidateNested()
  @Type(() => WebSocketConfigDto)
  websocket: WebSocketConfigDto;

  @ApiProperty({ description: 'CORS 配置', type: CorsConfigDto })
  @ValidateNested()
  @Type(() => CorsConfigDto)
  cors: CorsConfigDto;

  @ApiProperty({ description: '安全配置', type: SecurityConfigDto })
  @ValidateNested()
  @Type(() => SecurityConfigDto)
  security: SecurityConfigDto;

  @ApiProperty({ description: '请求队列配置', type: RequestQueueConfigDto })
  @ValidateNested()
  @Type(() => RequestQueueConfigDto)
  requestQueue: RequestQueueConfigDto;

  @ApiProperty({ description: '批量并发限制', default: 10 })
  batchConcurrencyLimit: number;
}

/**
 * MT 服务器配置
 */
export class MtServerBootstrapConfigDto {
  @ApiProperty({ description: '服务器 ID' })
  id: string;

  @ApiProperty({ description: '服务器标识符' })
  serverId: string;

  @ApiPropertyOptional({ description: '显示名称' })
  displayName?: string;

  @ApiProperty({ description: '平台类型 (MT5/MT4)' })
  platformType: string;

  @ApiProperty({ description: 'MT 服务器地址 (ip:port)' })
  serverAddress: string;

  @ApiProperty({ description: '管理员登录账号' })
  managerLogin: string;

  @ApiProperty({ description: '管理员密码 (解密后)' })
  managerPassword: string;

  @ApiProperty({ description: '是否启用' })
  isActive: boolean;

  @ApiProperty({ description: '是否默认服务器' })
  isDefault: boolean;
}

/**
 * 租户配置
 */
export class TenantBootstrapConfigDto {
  @ApiProperty({ description: '租户 ID' })
  tenantId: string;

  @ApiProperty({ description: '租户代码' })
  tenantCode: string;

  @ApiProperty({ description: '租户名称' })
  tenantName: string;

  @ApiProperty({ description: 'MT 服务器配置列表', type: [MtServerBootstrapConfigDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MtServerBootstrapConfigDto)
  mtServers: MtServerBootstrapConfigDto[];
}

/**
 * 完整引导配置响应
 * 包含中间件启动所需的全部配置
 */
export class BootstrapConfigResponseDto {
  @ApiProperty({ description: '中间件 ID' })
  middlewareId: string;

  @ApiProperty({ description: '中间件名称' })
  middlewareName: string;

  @ApiProperty({ description: '配置版本号' })
  configVersion: number;

  @ApiProperty({ description: '配置更新时间' })
  configUpdatedAt: Date;

  // 基础设施配置
  @ApiProperty({ description: 'Redis 配置', type: RedisConfigDto })
  @ValidateNested()
  @Type(() => RedisConfigDto)
  redis: RedisConfigDto;

  @ApiProperty({ description: '数据库配置', type: DatabaseConfigDto })
  @ValidateNested()
  @Type(() => DatabaseConfigDto)
  database: DatabaseConfigDto;

  // 安全配置
  @ApiProperty({ description: 'JWT 配置', type: JwtConfigDto })
  @ValidateNested()
  @Type(() => JwtConfigDto)
  jwt: JwtConfigDto;

  @ApiProperty({ description: '加密配置', type: EncryptionConfigDto })
  @ValidateNested()
  @Type(() => EncryptionConfigDto)
  encryption: EncryptionConfigDto;

  // 缓存配置 (保留兼容性，实际值从 runtime.cache 获取)
  @ApiProperty({ description: '缓存配置', type: CacheConfigDto })
  @ValidateNested()
  @Type(() => CacheConfigDto)
  cache: CacheConfigDto;

  // 运行时配置 (从数据库加载，可动态调整)
  @ApiProperty({ description: '运行时配置', type: RuntimeConfigDto })
  @ValidateNested()
  @Type(() => RuntimeConfigDto)
  runtime: RuntimeConfigDto;

  // 租户和服务器配置
  @ApiProperty({ description: '租户配置列表', type: [TenantBootstrapConfigDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TenantBootstrapConfigDto)
  tenants: TenantBootstrapConfigDto[];

  // 运行时参数
  @ApiProperty({ description: '心跳间隔 (秒)', default: 30 })
  heartbeatInterval: number;

  @ApiProperty({ description: '配置轮询间隔 (秒)', default: 60 })
  configPollInterval: number;
}

// ============================================
// 心跳相关
// ============================================

/**
 * 心跳请求 DTO
 */
export class BootstrapHeartbeatDto {
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

  @ApiPropertyOptional({ description: '当前配置版本' })
  @IsOptional()
  @IsNumber()
  currentConfigVersion?: number;

  @ApiPropertyOptional({ description: '健康状态 (healthy/degraded/unhealthy)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'MT5 连接状态' })
  @IsOptional()
  @IsObject()
  mt5Status?: {
    connected: boolean;
    serverCount: number;
    activeConnections: number;
  };

  @ApiPropertyOptional({ description: 'Redis 连接状态' })
  @IsOptional()
  @IsBoolean()
  redisConnected?: boolean;
}

/**
 * 心跳响应 DTO
 */
export class BootstrapHeartbeatResponseDto {
  @ApiProperty({ description: '是否成功' })
  success: boolean;

  @ApiProperty({ description: '服务器时间' })
  serverTime: Date;

  @ApiProperty({ description: '下次心跳间隔 (秒)' })
  nextHeartbeatInterval: number;

  @ApiPropertyOptional({ description: '配置是否有更新' })
  configUpdated?: boolean;

  @ApiPropertyOptional({ description: '最新配置版本' })
  latestConfigVersion?: number;

  @ApiPropertyOptional({ description: '需要重新拉取配置' })
  requireConfigRefresh?: boolean;
}
