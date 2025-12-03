import { ApiProperty } from '@nestjs/swagger';

/**
 * 登录成功响应
 */
export class LoginResponseDto {
  @ApiProperty({
    description: '访问令牌',
  })
  accessToken: string;

  @ApiProperty({
    description: '刷新令牌',
  })
  refreshToken: string;

  @ApiProperty({
    description: '令牌过期时间 (秒)',
    example: 86400,
  })
  expiresIn: number;

  @ApiProperty({
    description: '令牌类型',
    example: 'Bearer',
  })
  tokenType: string;
}

/**
 * 当前用户信息响应
 */
export class CurrentUserDto {
  @ApiProperty({ description: '管理员 ID' })
  id: string;

  @ApiProperty({ description: '邮箱' })
  email: string;

  @ApiProperty({ description: '姓名' })
  name: string;

  @ApiProperty({ description: '角色', enum: ['owner', 'admin', 'operator'] })
  role: string;

  @ApiProperty({ description: '租户 ID' })
  tenantId: string;

  @ApiProperty({ description: '租户名称' })
  tenantName: string;

  @ApiProperty({ description: '实例 ID' })
  instanceId: string;

  @ApiProperty({ description: '头像 URL', required: false })
  avatar?: string;

  @ApiProperty({ description: '最后登录时间' })
  lastLoginAt?: string;
}

/**
 * Token 刷新响应
 */
export class RefreshResponseDto {
  @ApiProperty({ description: '新的访问令牌' })
  accessToken: string;

  @ApiProperty({ description: '新的刷新令牌' })
  refreshToken: string;

  @ApiProperty({ description: '过期时间 (秒)' })
  expiresIn: number;
}
