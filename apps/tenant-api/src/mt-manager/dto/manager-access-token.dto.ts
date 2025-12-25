import { ApiProperty } from '@nestjs/swagger';

/**
 * Manager 基本信息 DTO (用于 Access Token 响应)
 */
export class ManagerAccessTokenInfoDto {
  @ApiProperty({
    description: '经理账号 UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: '经理账号登录号',
    example: '10007',
  })
  managerLogin: string;

  @ApiProperty({
    description: '显示名称',
    example: '主管理员账号',
    nullable: true,
  })
  displayName: string | null;

  @ApiProperty({
    description: '服务器名称',
    example: 'MT5-Demo',
    nullable: true,
  })
  serverName: string | null;

  @ApiProperty({
    description: '平台类型',
    example: 'MT5',
    enum: ['MT4', 'MT5'],
  })
  platformType: string;
}

/**
 * Manager Access Token 响应 DTO
 *
 * 用于 POST /api/v1/mt-managers/{managerId}/access-token 端点响应
 * 提供租户后台获取指定 Manager 的 Pool Mode Access Token
 *
 * Requirements: REQ-4 (新增内部 Access Token 端点)
 */
export class ManagerAccessTokenResponseDto {
  @ApiProperty({
    description: 'Pool Mode Access Token (JWT)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Token 有效期 (秒)',
    example: 900,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'Token 过期时间 (Unix 时间戳，秒)',
    example: 1702900000,
  })
  expiresAt: number;

  @ApiProperty({
    description: 'Token 类型',
    example: 'Bearer',
    enum: ['Bearer'],
  })
  tokenType: 'Bearer';

  @ApiProperty({
    description: '对应中间件实例的 URL',
    example: 'https://middleware-1.example.com:8443',
  })
  middlewareUrl: string;

  @ApiProperty({
    description: '经理账号信息',
    type: ManagerAccessTokenInfoDto,
  })
  manager: ManagerAccessTokenInfoDto;
}
