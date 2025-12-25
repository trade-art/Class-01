import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUrl,
  IsOptional,
  IsBoolean,
  IsEnum,
  MinLength,
} from 'class-validator';
import { PlatformType } from '../../middleware-proxy/adapters/types';

/**
 * 创建 MT 服务器请求 DTO
 * 注意：经理账号现在在单独的 MtManager 模块中管理
 */
export class CreateMtServerRequestDto {
  @ApiProperty({
    description: '服务器唯一标识符',
    example: 'mt5-main',
  })
  @IsString({ message: '服务器 ID 必须是字符串' })
  @MinLength(1, { message: '服务器 ID 不能为空' })
  serverId: string;

  @ApiPropertyOptional({
    description: '显示名称',
    example: 'MT5 主服务器',
  })
  @IsOptional()
  @IsString({ message: '显示名称必须是字符串' })
  displayName?: string;

  @ApiPropertyOptional({
    description: '平台类型',
    enum: PlatformType,
    default: PlatformType.MT5,
  })
  @IsOptional()
  @IsEnum(PlatformType, { message: '平台类型必须是 MT5 或 MT4' })
  platformType?: PlatformType;

  @ApiProperty({
    description: '中间件实例 ID',
    example: 'uuid-middleware-id',
  })
  @IsString({ message: '中间件实例 ID 必须是字符串' })
  @MinLength(1, { message: '请选择中间件实例' })
  middlewareId: string;

  @ApiProperty({
    description: '中间件服务地址 (从选择的中间件实例自动获取)',
    example: 'http://localhost:3002',
  })
  @IsUrl(
    { require_tld: false },
    { message: '请输入有效的中间件 URL (例如: http://localhost:3002)' },
  )
  middlewareUrl: string;

  @ApiProperty({
    description: 'MT 服务器地址',
    example: '192.168.1.100:443',
  })
  @IsString({ message: '服务器地址必须是字符串' })
  @MinLength(1, { message: '服务器地址不能为空' })
  serverAddress: string;

  @ApiPropertyOptional({
    description: '是否设为默认服务器',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isDefault 必须是布尔值' })
  isDefault?: boolean;
}

/**
 * 更新 MT 服务器请求 DTO
 * 注意：经理账号现在在单独的 MtManager 模块中管理
 */
export class UpdateMtServerRequestDto {
  @ApiPropertyOptional({
    description: '显示名称',
    example: 'MT5 主服务器',
  })
  @IsOptional()
  @IsString({ message: '显示名称必须是字符串' })
  displayName?: string;

  @ApiPropertyOptional({
    description: '中间件实例 ID',
    example: 'uuid-middleware-id',
  })
  @IsOptional()
  @IsString({ message: '中间件实例 ID 必须是字符串' })
  middlewareId?: string;

  @ApiPropertyOptional({
    description: '中间件服务地址',
    example: 'http://localhost:3002',
  })
  @IsOptional()
  @IsUrl(
    { require_tld: false },
    { message: '请输入有效的中间件 URL (例如: http://localhost:3002)' },
  )
  middlewareUrl?: string;

  @ApiPropertyOptional({
    description: 'MT 服务器地址',
    example: '192.168.1.100:443',
  })
  @IsOptional()
  @IsString({ message: '服务器地址必须是字符串' })
  serverAddress?: string;

  @ApiPropertyOptional({
    description: '是否设为默认服务器',
    example: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isDefault 必须是布尔值' })
  isDefault?: boolean;
}

/**
 * 切换服务器状态请求 DTO
 */
export class ToggleServerStatusDto {
  @ApiProperty({
    description: '是否启用',
    example: true,
  })
  @IsBoolean({ message: 'isActive 必须是布尔值' })
  isActive: boolean;
}

/**
 * 连接测试结果响应 DTO
 */
export class ConnectionTestResponseDto {
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

/**
 * MT 服务器响应 DTO
 * 注意：经理账号信息现在通过 MtManager API 获取
 */
export class MtServerResponseDto {
  @ApiProperty({ description: '服务器 UUID' })
  id: string;

  @ApiProperty({ description: '服务器 ID' })
  serverId: string;

  @ApiProperty({ description: '显示名称', nullable: true })
  displayName: string | null;

  @ApiProperty({ description: '平台类型', enum: PlatformType })
  platformType: PlatformType;

  @ApiProperty({ description: '中间件实例 ID', nullable: true })
  middlewareId: string | null;

  @ApiProperty({ description: '中间件 URL' })
  middlewareUrl: string;

  @ApiProperty({ description: 'MT 服务器地址' })
  serverAddress: string;

  @ApiProperty({ description: '已配置的经理账号数量' })
  managerCount: number;

  @ApiProperty({ description: '是否启用' })
  isActive: boolean;

  @ApiProperty({ description: '是否为默认服务器' })
  isDefault: boolean;

  @ApiProperty({ description: '创建时间' })
  createdAt: string;

  @ApiProperty({ description: '更新时间' })
  updatedAt: string;
}

/**
 * MT 服务器列表响应 DTO
 */
export class MtServerListResponseDto {
  @ApiProperty({
    description: '服务器列表',
    type: [MtServerResponseDto],
  })
  servers: MtServerResponseDto[];

  @ApiProperty({
    description: '总数',
    example: 2,
  })
  total: number;
}
