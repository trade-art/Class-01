import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 租户信息 DTO (用于登录响应)
 */
export class TenantInfoDto {
  @ApiProperty({ description: '租户 ID' })
  id: string;

  @ApiProperty({ description: '租户代码' })
  code: string;

  @ApiProperty({ description: '租户名称' })
  name: string;

  @ApiPropertyOptional({ description: 'Logo URL' })
  logo?: string;

  @ApiPropertyOptional({ description: '显示名称' })
  displayName?: string;

  @ApiPropertyOptional({ description: '主题色' })
  primaryColor?: string;

  @ApiPropertyOptional({ description: '自定义域名' })
  customDomain?: string;

  @ApiPropertyOptional({ description: 'Favicon URL' })
  favicon?: string;
}

/**
 * 管理员信息 DTO (用于登录响应)
 */
export class AdminInfoDto {
  @ApiProperty({ description: '管理员 ID' })
  id: string;

  @ApiProperty({ description: '邮箱' })
  email: string;

  @ApiProperty({ description: '姓名' })
  name: string;

  @ApiProperty({ description: '角色', enum: ['owner', 'admin', 'operator'] })
  role: string;

  @ApiPropertyOptional({ description: '最后登录时间' })
  lastLoginAt?: string;

  @ApiPropertyOptional({ description: '最后登录 IP' })
  lastLoginIp?: string;

  @ApiProperty({ description: '账户创建时间' })
  createdAt: string;
}

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

  @ApiProperty({
    description: '管理员信息',
    type: AdminInfoDto,
  })
  admin: AdminInfoDto;

  @ApiProperty({
    description: '租户信息',
    type: TenantInfoDto,
  })
  tenant: TenantInfoDto;
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

  @ApiPropertyOptional({ description: '头像 URL' })
  avatar?: string;

  @ApiPropertyOptional({ description: '最后登录时间' })
  lastLoginAt?: string;

  @ApiPropertyOptional({ description: '最后登录 IP' })
  lastLoginIp?: string;

  @ApiProperty({ description: '账户创建时间' })
  createdAt: string;
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
