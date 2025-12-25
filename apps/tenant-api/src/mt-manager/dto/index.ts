import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  MinLength,
  Min,
  IsUUID,
} from 'class-validator';

// Access Token 相关 DTO
export * from './manager-access-token.dto';

/**
 * 创建 MT 经理账号请求 DTO
 */
export class CreateMtManagerRequestDto {
  @ApiProperty({
    description: '关联的 MT 服务器 ID',
    example: 'uuid-of-mt-server',
  })
  @IsUUID('4', { message: '请选择有效的 MT 服务器' })
  mtServerId: string;

  @ApiProperty({
    description: '经理账号登录号',
    example: 10007,
  })
  @IsNumber({}, { message: '经理账号必须是数字' })
  @Min(1, { message: '经理账号必须大于 0' })
  managerLogin: number;

  @ApiProperty({
    description: '经理账号密码',
    example: 'password123',
    minLength: 1,
  })
  @IsString({ message: '密码必须是字符串' })
  @MinLength(1, { message: '密码不能为空' })
  managerPassword: string;

  @ApiPropertyOptional({
    description: '显示名称',
    example: '主管理员账号',
  })
  @IsOptional()
  @IsString({ message: '显示名称必须是字符串' })
  displayName?: string;

  @ApiPropertyOptional({
    description: '是否设为该服务器的默认账号',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isDefault 必须是布尔值' })
  isDefault?: boolean;
}

/**
 * 更新 MT 经理账号请求 DTO
 */
export class UpdateMtManagerRequestDto {
  @ApiPropertyOptional({
    description: '新密码 (留空表示不修改)',
    example: 'newpassword123',
  })
  @IsOptional()
  @IsString({ message: '密码必须是字符串' })
  managerPassword?: string;

  @ApiPropertyOptional({
    description: '显示名称',
    example: '主管理员账号',
  })
  @IsOptional()
  @IsString({ message: '显示名称必须是字符串' })
  displayName?: string;

  @ApiPropertyOptional({
    description: '是否设为该服务器的默认账号',
    example: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isDefault 必须是布尔值' })
  isDefault?: boolean;
}

/**
 * 切换账号状态请求 DTO
 */
export class ToggleManagerStatusDto {
  @ApiProperty({
    description: '是否启用',
    example: true,
  })
  @IsBoolean({ message: 'isActive 必须是布尔值' })
  isActive: boolean;
}

/**
 * MT 经理账号响应 DTO
 */
export class MtManagerResponseDto {
  @ApiProperty({ description: '账号 UUID' })
  id: string;

  @ApiProperty({ description: '关联的服务器 UUID' })
  mtServerId: string;

  @ApiProperty({ description: '服务器显示名称', nullable: true })
  serverName: string | null;

  @ApiProperty({ description: '服务器 ID' })
  serverId: string;

  @ApiProperty({ description: '平台类型' })
  platformType: string;

  @ApiProperty({ description: '经理账号登录号' })
  managerLogin: string;

  @ApiProperty({ description: '显示名称', nullable: true })
  displayName: string | null;

  @ApiProperty({ description: '是否启用' })
  isActive: boolean;

  @ApiProperty({ description: '是否为该服务器的默认账号' })
  isDefault: boolean;

  @ApiProperty({ description: '创建时间' })
  createdAt: string;

  @ApiProperty({ description: '更新时间' })
  updatedAt: string;
}

/**
 * MT 经理账号列表响应 DTO
 */
export class MtManagerListResponseDto {
  @ApiProperty({
    description: '经理账号列表',
    type: [MtManagerResponseDto],
  })
  managers: MtManagerResponseDto[];

  @ApiProperty({
    description: '总数',
    example: 5,
  })
  total: number;
}

/**
 * 连接测试结果响应 DTO
 */
export class ManagerConnectionTestResponseDto {
  @ApiProperty({
    description: '连接是否成功',
    example: true,
  })
  success: boolean;

  @ApiPropertyOptional({
    description: '响应延迟 (毫秒)',
    example: 150,
  })
  latency?: number;

  @ApiPropertyOptional({
    description: '服务器版本',
    example: 'MT5 Build 3815',
  })
  serverVersion?: string;

  @ApiPropertyOptional({
    description: '服务器时间',
    example: '2024-12-05T10:00:00.000Z',
  })
  serverTime?: string;

  @ApiPropertyOptional({
    description: '错误信息',
    example: '连接超时',
  })
  error?: string;
}

// ============================================
// API Key 相关 DTO
// ============================================

/**
 * 切换 API Key 启用状态请求 DTO
 */
export class ToggleApiKeyDto {
  @ApiProperty({
    description: '是否启用 API Key',
    example: true,
  })
  @IsBoolean({ message: 'enabled 必须是布尔值' })
  enabled: boolean;
}

/**
 * 更新 API Key IP 白名单请求 DTO
 */
export class UpdateApiKeyAllowedIpsDto {
  @ApiProperty({
    description: 'IP 白名单 (支持 CIDR 格式)',
    example: ['192.168.1.100', '10.0.0.0/24'],
    type: [String],
  })
  @IsArray({ message: 'allowedIps 必须是数组' })
  @IsString({ each: true, message: 'IP 地址必须是字符串' })
  allowedIps: string[];
}

/**
 * 生成 API Key 请求 DTO
 */
export class GenerateApiKeyRequestDto {
  @ApiPropertyOptional({
    description: '权限作用域列表 (默认: ["*"] 表示所有权限)',
    example: ['users:read', 'positions:read', 'trading:execute'],
    type: [String],
    default: ['*'],
  })
  @IsOptional()
  @IsArray({ message: 'scopes 必须是数组' })
  @IsString({ each: true, message: '作用域必须是字符串' })
  scopes?: string[];
}

/**
 * 更新 API Key 作用域请求 DTO
 */
export class UpdateApiKeyScopesDto {
  @ApiProperty({
    description: '权限作用域列表',
    example: ['users:read', 'positions:read', 'trading:execute'],
    type: [String],
  })
  @IsArray({ message: 'scopes 必须是数组' })
  @IsString({ each: true, message: '作用域必须是字符串' })
  scopes: string[];
}

/**
 * 作用域选项 DTO
 */
export class ApiKeyScopeOptionDto {
  @ApiProperty({
    description: '作用域值',
    example: 'trading:execute',
  })
  value: string;

  @ApiProperty({
    description: '作用域显示名称',
    example: '执行交易操作',
  })
  label: string;
}

/**
 * 可用作用域列表响应 DTO
 */
export class AvailableScopesResponseDto {
  @ApiProperty({
    description: '可用作用域列表',
    type: [ApiKeyScopeOptionDto],
  })
  scopes: ApiKeyScopeOptionDto[];
}

/**
 * API Key 生成响应 DTO
 */
export class GenerateApiKeyResponseDto {
  @ApiProperty({
    description: 'API Key ID (公开标识)',
    example: 'mk_abc123def456',
  })
  apiKeyId: string;

  @ApiProperty({
    description: 'API Secret (仅显示一次，请妥善保存)',
    example: 'ms_xyz789abc123def456789012345678901234567890123456',
  })
  apiSecret: string;

  @ApiProperty({
    description: 'MT 经理账号 ID',
    example: 'uuid-of-manager',
  })
  managerId: string;

  @ApiProperty({
    description: '创建时间',
    example: '2024-12-18T10:00:00.000Z',
  })
  createdAt: string;
}

/**
 * API Key 状态响应 DTO
 */
export class ApiKeyStatusResponseDto {
  @ApiProperty({
    description: '是否已配置 API Key',
    example: true,
  })
  hasApiKey: boolean;

  @ApiPropertyOptional({
    description: 'API Key ID (掩码显示)',
    example: 'mk_abc123****def4',
    nullable: true,
  })
  apiKeyId: string | null;

  @ApiProperty({
    description: 'API Key 是否已启用',
    example: true,
  })
  apiKeyEnabled: boolean;

  @ApiProperty({
    description: 'IP 白名单',
    example: ['192.168.1.100', '10.0.0.0/24'],
    type: [String],
  })
  apiKeyAllowedIps: string[];

  @ApiProperty({
    description: '权限作用域',
    example: ['users:read', 'positions:read', 'trading:execute'],
    type: [String],
  })
  apiKeyScopes: string[];

  @ApiPropertyOptional({
    description: '创建时间',
    example: '2024-12-18T10:00:00.000Z',
    nullable: true,
  })
  apiKeyCreatedAt: string | null;

  @ApiPropertyOptional({
    description: '最后使用时间',
    example: '2024-12-18T12:30:00.000Z',
    nullable: true,
  })
  apiKeyLastUsedAt: string | null;

  @ApiPropertyOptional({
    description: '最后使用 IP',
    example: '192.168.1.100',
    nullable: true,
  })
  apiKeyLastUsedIp: string | null;
}

/**
 * 获取 API Secret 响应 DTO
 */
export class GetApiSecretResponseDto {
  @ApiProperty({
    description: 'API Key ID',
    example: 'mk_abc123def456789012345678',
  })
  apiKeyId: string;

  @ApiProperty({
    description: 'API Secret (明文)',
    example: 'ms_xyz789abc123def456789012345678901234567890123456',
  })
  apiSecret: string;
}

// ============================================
// Internal API DTO (供中间件调用)
// ============================================

/**
 * 内部接口 - 经理账号信息 DTO
 * 用于 C++ 中间件启动时获取需要预连接的经理账号列表
 */
export class InternalManagerInfoDto {
  @ApiProperty({ description: '经理账号 UUID (连接池唯一标识)' })
  managerId: string;

  @ApiProperty({ description: '租户 ID' })
  tenantId: string;

  @ApiProperty({ description: 'MT 服务器 UUID' })
  mtServerId: string;

  @ApiProperty({ description: 'MT 服务器地址 (host:port)' })
  serverAddress: string;

  @ApiProperty({ description: '经理账号登录号 (uint64)' })
  managerLogin: string;

  @ApiProperty({ description: '加密的经理账号密码' })
  encryptedPassword: string;
}

/**
 * 内部接口 - 经理账号列表响应 DTO
 */
export class InternalManagerListResponseDto {
  @ApiProperty({
    description: '经理账号列表',
    type: [InternalManagerInfoDto],
  })
  managers: InternalManagerInfoDto[];

  @ApiProperty({
    description: '总数',
    example: 5,
  })
  total: number;
}

// ============================================
// API Key 认证相关 DTO (公开端点)
// ============================================

/**
 * API Key 认证请求 DTO
 * 用于第三方应用通过 API Key + Secret 获取 Token
 */
export class AuthenticateApiKeyDto {
  @ApiProperty({
    description: 'API Key ID',
    example: 'mk_abc123def456789012345678',
  })
  @IsString({ message: 'apiKeyId 必须是字符串' })
  apiKeyId: string;

  @ApiProperty({
    description: 'API Secret',
    example: 'ms_xyz789abc123def456789012345678901234567890123456',
  })
  @IsString({ message: 'apiSecret 必须是字符串' })
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
  @IsString({ message: 'refreshToken 必须是字符串' })
  refreshToken: string;
}

/**
 * 经理账号信息 DTO (用于认证响应)
 */
export class ManagerInfoDto {
  @ApiProperty({ description: '经理账号 UUID' })
  id: string;

  @ApiProperty({ description: '经理账号登录号' })
  managerLogin: string;

  @ApiProperty({ description: '显示名称', nullable: true })
  displayName: string | null;

  @ApiProperty({ description: '服务器 ID' })
  serverId: string;

  @ApiProperty({ description: '服务器名称', nullable: true })
  serverName: string | null;

  @ApiProperty({ description: '平台类型 (MT4/MT5)' })
  platformType: string;
}

/**
 * API Key 认证响应 DTO
 */
export class AuthenticateApiKeyResponseDto {
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
    description: 'Access Token 有效期 (秒)',
    example: 900,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'Refresh Token 有效期 (秒)',
    example: 604800,
  })
  refreshExpiresIn: number;

  @ApiProperty({
    description: 'Token 类型',
    example: 'Bearer',
  })
  tokenType: string;

  @ApiProperty({
    description: '经理账号信息',
    type: ManagerInfoDto,
  })
  manager: ManagerInfoDto;
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
    description: 'Access Token 有效期 (秒)',
    example: 900,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'Refresh Token 有效期 (秒)',
    example: 604800,
  })
  refreshExpiresIn: number;

  @ApiProperty({
    description: 'Token 类型',
    example: 'Bearer',
  })
  tokenType: string;
}
