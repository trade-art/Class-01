import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 中间件实例 DTO
 */
export class MiddlewareInstanceDto {
  @ApiProperty({ description: '中间件 ID' })
  id: string;

  @ApiProperty({ description: '中间件名称' })
  name: string;

  @ApiPropertyOptional({ description: '描述' })
  description?: string;

  @ApiProperty({ description: '中间件 URL' })
  url: string;

  @ApiProperty({
    description: '平台类型',
    enum: ['MT5', 'MT4'],
    example: 'MT5',
  })
  platformType: string;

  @ApiProperty({
    description: '状态',
    enum: ['ONLINE', 'OFFLINE', 'DEGRADED', 'UNKNOWN'],
  })
  status: string;

  @ApiPropertyOptional({ description: '服务器 IP' })
  serverIp?: string;

  @ApiPropertyOptional({ description: '最后心跳时间' })
  lastHeartbeat?: Date;

  @ApiPropertyOptional({ description: '活跃会话数' })
  activeSessions?: number;

  @ApiPropertyOptional({ description: '内存使用率 (%)' })
  memoryUsagePercent?: number;

  @ApiPropertyOptional({ description: 'CPU 使用率 (%)' })
  cpuUsage?: number;

  @ApiProperty({ description: '分配时间' })
  assignedAt: Date;

  @ApiProperty({
    description: '经理账号连接状态',
    enum: ['CONNECTED', 'DISCONNECTED', 'NOT_CONFIGURED'],
    example: 'CONNECTED',
  })
  managerStatus: 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONFIGURED';

  @ApiPropertyOptional({ description: '默认经理账号登录号' })
  defaultManagerLogin?: string;
}

/**
 * 中间件实例列表响应 DTO
 */
export class MiddlewareInstanceListResponseDto {
  @ApiProperty({ type: [MiddlewareInstanceDto], description: '中间件列表' })
  middlewares: MiddlewareInstanceDto[];

  @ApiProperty({ description: '总数' })
  total: number;
}
