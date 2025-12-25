import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength } from 'class-validator';

/**
 * 外部认证请求 DTO
 */
export class ExternalAuthDto {
  @ApiProperty({
    description: 'API Key ID',
    example: 'mk_abc123def456789012345678',
  })
  @IsString({ message: 'API Key ID 必须是字符串' })
  @IsNotEmpty({ message: 'API Key ID 不能为空' })
  apiKeyId: string;

  @ApiProperty({
    description: 'API Secret',
    example: 'ms_xyz789abc123def456789012345678901234567890123456',
  })
  @IsString({ message: 'API Secret 必须是字符串' })
  @IsNotEmpty({ message: 'API Secret 不能为空' })
  @MinLength(10, { message: 'API Secret 格式不正确' })
  apiSecret: string;
}

/**
 * 刷新 Token 请求 DTO
 */
export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh Token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString({ message: 'Refresh Token 必须是字符串' })
  @IsNotEmpty({ message: 'Refresh Token 不能为空' })
  refreshToken: string;
}

/**
 * 外部认证响应 DTO
 */
export class ExternalAuthResponseDto {
  @ApiProperty({
    description: 'Access Token (15分钟有效)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Refresh Token (7天有效)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'Access Token 过期时间 (秒)',
    example: 900,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'Refresh Token 过期时间 (秒)',
    example: 604800,
  })
  refreshExpiresIn: number;

  @ApiProperty({
    description: 'Token 类型',
    example: 'Bearer',
  })
  tokenType: 'Bearer';

  @ApiProperty({
    description: 'MT Manager 信息',
    example: {
      id: 'uuid-of-manager',
      managerLogin: '10007',
      displayName: '主管理员',
      serverId: 'Demo-MT5',
      serverName: 'Demo MT5 Server',
      platformType: 'MT5',
    },
  })
  manager: {
    id: string;
    managerLogin: string;
    displayName: string | null;
    serverId: string;
    serverName: string | null;
    platformType: string;
  };
}

/**
 * 刷新 Token 响应 DTO
 */
export class RefreshTokenResponseDto {
  @ApiProperty({
    description: '新的 Access Token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: '新的 Refresh Token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'Access Token 过期时间 (秒)',
    example: 900,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'Refresh Token 过期时间 (秒)',
    example: 604800,
  })
  refreshExpiresIn: number;
}
