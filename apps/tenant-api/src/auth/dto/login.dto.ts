import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

/**
 * 登录请求 DTO
 */
export class LoginDto {
  @ApiProperty({
    description: '管理员邮箱',
    example: 'admin@tenant.com',
  })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email: string;

  @ApiProperty({
    description: '密码',
    example: 'password123',
    minLength: 6,
  })
  @IsString()
  @MinLength(6, { message: '密码长度至少为 6 位' })
  password: string;

  @ApiPropertyOptional({
    description: '租户代码 (白标域名登录时可选，系统会自动从域名识别)',
    example: 'DEMO',
  })
  @IsOptional()
  @IsString()
  tenantCode?: string;

  @ApiPropertyOptional({
    description: '记住登录状态',
    example: false,
  })
  @IsOptional()
  rememberMe?: boolean;
}

/**
 * 刷新 Token 请求 DTO
 */
export class RefreshTokenDto {
  @ApiProperty({
    description: '刷新令牌',
  })
  @IsString()
  refreshToken: string;
}

/**
 * 修改密码请求 DTO
 */
export class ChangePasswordDto {
  @ApiProperty({
    description: '当前密码',
  })
  @IsString()
  @MinLength(6)
  currentPassword: string;

  @ApiProperty({
    description: '新密码',
    minLength: 6,
  })
  @IsString()
  @MinLength(6, { message: '新密码长度至少为 6 位' })
  newPassword: string;
}
