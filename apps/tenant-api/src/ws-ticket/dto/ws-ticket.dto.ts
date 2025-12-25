import { ApiProperty } from '@nestjs/swagger';

/**
 * WebSocket Ticket 响应 DTO
 * 用于返回给第三方应用的 WS 连接凭证
 */
export class WsTicketResponseDto {
  @ApiProperty({
    description: 'WebSocket 连接凭证 (一次性使用，30秒过期)',
    example: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678',
  })
  ticket: string;

  @ApiProperty({
    description: 'WebSocket 服务端点 URL',
    example: 'wss://ws.example.com/trading',
  })
  endpoint: string;

  @ApiProperty({
    description: '凭证有效期 (秒)',
    example: 30,
  })
  expiresIn: number;

  @ApiProperty({
    description: '可订阅的频道列表',
    example: ['quotes', 'positions', 'orders'],
    type: [String],
  })
  channels: string[];
}

/**
 * WebSocket Ticket 存储数据结构
 * 存储在 Redis 中，供中间件验证使用
 */
export interface WsTicketData {
  /** 租户 ID */
  tenantId: string;
  /** MT Manager ID */
  managerId: string;
  /** API Key ID */
  apiKeyId: string;
  /** MT 服务器 ID */
  serverId: string;
  /** 允许的权限范围 */
  scopes: string[];
  /** 允许订阅的频道 */
  channels: string[];
  /** 创建时间戳 */
  createdAt: number;
}
