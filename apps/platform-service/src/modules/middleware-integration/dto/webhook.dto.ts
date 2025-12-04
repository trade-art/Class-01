import { IsString, IsObject, IsOptional, IsNumber, IsIn, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Webhook 事件 DTO
 * middleware-integration Task 8
 */
export class WebhookEventDto {
  @ApiProperty({ description: '事件类型' })
  @IsString()
  event: string;

  @ApiProperty({ description: '实例标识符' })
  @IsString()
  instanceId: string;

  @ApiProperty({ description: '事件时间戳' })
  @IsDateString()
  timestamp: string;

  @ApiProperty({ description: '事件数据' })
  @IsObject()
  data: Record<string, any>;

  @ApiPropertyOptional({ description: '事件严重级别' })
  @IsOptional()
  @IsIn(['INFO', 'WARNING', 'ERROR', 'CRITICAL'])
  severity?: string;
}

/**
 * MT5 状态变更事件 DTO
 */
export class MT5StatusChangeDto {
  @ApiProperty({ description: 'MT5 服务器 ID' })
  @IsString()
  serverId: string;

  @ApiProperty({ description: '事件类型', enum: ['disconnect', 'reconnect'] })
  @IsIn(['disconnect', 'reconnect'])
  event: 'disconnect' | 'reconnect';

  @ApiPropertyOptional({ description: '断开/重连原因' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: '重连尝试次数' })
  @IsOptional()
  @IsNumber()
  retryCount?: number;
}

/**
 * 熔断器状态变更 DTO
 */
export class CircuitBreakerChangeDto {
  @ApiProperty({ description: '服务名称' })
  @IsString()
  service: string;

  @ApiProperty({ description: '新状态', enum: ['OPEN', 'CLOSED', 'HALF_OPEN'] })
  @IsIn(['OPEN', 'CLOSED', 'HALF_OPEN'])
  state: 'OPEN' | 'CLOSED' | 'HALF_OPEN';

  @ApiPropertyOptional({ description: '失败次数' })
  @IsOptional()
  @IsNumber()
  failures?: number;

  @ApiPropertyOptional({ description: '错误消息' })
  @IsOptional()
  @IsString()
  error?: string;
}

/**
 * 性能指标 DTO
 */
export class PerformanceMetricsDto {
  @ApiProperty({ description: 'CPU 使用率 (%)' })
  @IsNumber()
  cpuUsage: number;

  @ApiProperty({ description: '内存使用 (MB)' })
  @IsNumber()
  memoryUsageMB: number;

  @ApiProperty({ description: '活跃连接数' })
  @IsNumber()
  activeConnections: number;

  @ApiPropertyOptional({ description: '请求速率 (req/s)' })
  @IsOptional()
  @IsNumber()
  requestRate?: number;

  @ApiPropertyOptional({ description: '平均响应时间 (ms)' })
  @IsOptional()
  @IsNumber()
  avgResponseTimeMs?: number;
}

/**
 * 错误报告 DTO
 */
export class ErrorReportDto {
  @ApiProperty({ description: '错误代码' })
  @IsString()
  errorCode: string;

  @ApiProperty({ description: '错误消息' })
  @IsString()
  message: string;

  @ApiPropertyOptional({ description: '错误堆栈' })
  @IsOptional()
  @IsString()
  stack?: string;

  @ApiPropertyOptional({ description: '上下文信息' })
  @IsOptional()
  @IsObject()
  context?: Record<string, any>;

  @ApiProperty({ description: '错误时间戳' })
  @IsDateString()
  occurredAt: string;
}

/**
 * Webhook 验证头
 */
export class WebhookHeadersDto {
  'x-webhook-signature': string;
  'x-webhook-timestamp': string;
  'x-instance-id': string;
}

/**
 * MT5 连接事件 DTO (mt5-middleware-integration Task 11)
 * 用于 mt5.connected 和 mt5.disconnected 事件
 */
export class MT5ConnectionEventDto {
  @ApiProperty({ description: 'MT5 服务器 ID' })
  @IsString()
  serverId: string;

  @ApiPropertyOptional({ description: '服务器名称' })
  @IsOptional()
  @IsString()
  serverName?: string;

  @ApiPropertyOptional({ description: '连接/断开原因' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: '连接延迟 (ms)' })
  @IsOptional()
  @IsNumber()
  latencyMs?: number;

  @ApiPropertyOptional({ description: '时间戳' })
  @IsOptional()
  @IsDateString()
  timestamp?: string;
}

/**
 * 健康检查失败事件 DTO (mt5-middleware-integration Task 11)
 */
export class HealthCheckFailedEventDto {
  @ApiProperty({ description: '组件名称 (mt5, redis, database)' })
  @IsString()
  component: string;

  @ApiProperty({ description: '错误消息' })
  @IsString()
  errorMessage: string;

  @ApiPropertyOptional({ description: '连续失败次数' })
  @IsOptional()
  @IsNumber()
  consecutiveFailures?: number;

  @ApiPropertyOptional({ description: '最后检查时间' })
  @IsOptional()
  @IsDateString()
  lastCheckAt?: string;
}
