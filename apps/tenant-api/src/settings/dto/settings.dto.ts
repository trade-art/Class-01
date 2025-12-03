import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsUrl,
  MinLength,
  MaxLength,
  IsArray,
} from 'class-validator';

// ============================================
// Branding DTOs (白标配置)
// ============================================

/**
 * 白标配置 DTO
 */
export class BrandingDto {
  @ApiPropertyOptional({ description: '品牌名称' })
  displayName?: string;

  @ApiPropertyOptional({ description: 'Logo URL' })
  logo?: string;

  @ApiPropertyOptional({ description: '主题色' })
  primaryColor?: string;
}

/**
 * 更新白标配置 DTO
 */
export class UpdateBrandingDto {
  @ApiPropertyOptional({ description: '品牌名称' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ description: '主题色 (十六进制)' })
  @IsOptional()
  @IsString()
  primaryColor?: string;
}

// ============================================
// Admin DTOs (管理员管理)
// ============================================

/**
 * 管理员角色枚举 (与 Prisma TenantRole 对应)
 */
export enum AdminRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
}

/**
 * 管理员列表项 DTO
 */
export class AdminListItemDto {
  @ApiProperty({ description: '管理员 ID' })
  id: string;

  @ApiProperty({ description: '邮箱' })
  email: string;

  @ApiProperty({ description: '姓名' })
  name: string;

  @ApiProperty({ description: '角色', enum: AdminRole })
  role: AdminRole;

  @ApiProperty({ description: '是否激活' })
  isActive: boolean;

  @ApiPropertyOptional({ description: '最后登录时间' })
  lastLogin?: string;

  @ApiProperty({ description: '创建时间' })
  createdAt: string;
}

/**
 * 管理员列表响应 DTO
 */
export class AdminListResponseDto {
  @ApiProperty({ description: '管理员列表', type: [AdminListItemDto] })
  admins: AdminListItemDto[];

  @ApiProperty({ description: '总数' })
  total: number;
}

/**
 * 创建管理员 DTO
 */
export class CreateAdminDto {
  @ApiProperty({ description: '邮箱' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: '姓名' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @ApiProperty({ description: '密码' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ description: '角色', enum: AdminRole })
  @IsEnum(AdminRole)
  role: AdminRole;
}

/**
 * 更新管理员 DTO
 */
export class UpdateAdminDto {
  @ApiPropertyOptional({ description: '姓名' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({ description: '角色', enum: AdminRole })
  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;
}

/**
 * 重置密码 DTO
 */
export class ResetPasswordDto {
  @ApiProperty({ description: '新密码' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}

/**
 * 更新状态 DTO
 */
export class UpdateStatusDto {
  @ApiProperty({ description: '是否激活' })
  @IsBoolean()
  isActive: boolean;
}

// ============================================
// API Keys DTOs (API 密钥管理)
// ============================================

/**
 * API 密钥权限
 */
export enum ApiKeyPermission {
  READ = 'read',
  WRITE = 'write',
  TRADE = 'trade',
}

/**
 * API 密钥列表项 DTO
 */
export class ApiKeyListItemDto {
  @ApiProperty({ description: '密钥 ID' })
  id: string;

  @ApiProperty({ description: '名称' })
  name: string;

  @ApiProperty({ description: '密钥前缀 (脱敏)' })
  keyPrefix: string;

  @ApiProperty({ description: '权限列表', type: [String] })
  permissions: string[];

  @ApiProperty({ description: '是否激活' })
  isActive: boolean;

  @ApiPropertyOptional({ description: '最后使用时间' })
  lastUsedAt?: string;

  @ApiProperty({ description: '创建时间' })
  createdAt: string;
}

/**
 * API 密钥列表响应 DTO
 */
export class ApiKeyListResponseDto {
  @ApiProperty({ description: 'API 密钥列表', type: [ApiKeyListItemDto] })
  apiKeys: ApiKeyListItemDto[];

  @ApiProperty({ description: '总数' })
  total: number;
}

/**
 * 创建 API 密钥 DTO
 */
export class CreateApiKeyDto {
  @ApiProperty({ description: '名称' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @ApiProperty({ description: '权限列表', type: [String] })
  @IsArray()
  @IsEnum(ApiKeyPermission, { each: true })
  permissions: ApiKeyPermission[];
}

/**
 * 创建 API 密钥响应 DTO
 */
export class CreateApiKeyResponseDto {
  @ApiProperty({ description: '密钥 ID' })
  id: string;

  @ApiProperty({ description: '名称' })
  name: string;

  @ApiProperty({ description: '完整密钥 (仅显示一次)' })
  apiKey: string;

  @ApiProperty({ description: '权限列表', type: [String] })
  permissions: string[];

  @ApiProperty({ description: '创建时间' })
  createdAt: string;
}

/**
 * 更新 API 密钥权限 DTO
 */
export class UpdateApiKeyPermissionsDto {
  @ApiProperty({ description: '权限列表', type: [String] })
  @IsArray()
  @IsEnum(ApiKeyPermission, { each: true })
  permissions: ApiKeyPermission[];
}

// ============================================
// Notifications DTOs (通知设置)
// ============================================

/**
 * 通知设置 DTO
 */
export class NotificationSettingsDto {
  @ApiProperty({ description: '风险预警邮件' })
  riskAlertEmail: boolean;

  @ApiProperty({ description: '系统通知邮件' })
  systemAlertEmail: boolean;

  @ApiPropertyOptional({ description: 'Webhook URL' })
  webhookUrl?: string;

  @ApiProperty({ description: 'Webhook 是否启用' })
  webhookEnabled: boolean;
}

/**
 * 更新通知设置 DTO
 */
export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional({ description: '风险预警邮件' })
  @IsOptional()
  @IsBoolean()
  riskAlertEmail?: boolean;

  @ApiPropertyOptional({ description: '系统通知邮件' })
  @IsOptional()
  @IsBoolean()
  systemAlertEmail?: boolean;

  @ApiPropertyOptional({ description: 'Webhook URL' })
  @IsOptional()
  @IsUrl()
  webhookUrl?: string;

  @ApiPropertyOptional({ description: 'Webhook 是否启用' })
  @IsOptional()
  @IsBoolean()
  webhookEnabled?: boolean;
}

// ============================================
// MT5 Server DTOs (MT5 服务器信息)
// ============================================

/**
 * MT5 服务器信息 DTO
 */
export class MT5ServerInfoDto {
  @ApiProperty({ description: '服务器名称' })
  serverName: string;

  @ApiProperty({ description: '连接状态' })
  connected: boolean;

  @ApiPropertyOptional({ description: '最后心跳时间' })
  lastHeartbeat?: string;

  @ApiPropertyOptional({ description: '延迟 (ms)' })
  latency?: number;

  @ApiProperty({ description: '版本' })
  version: string;
}
