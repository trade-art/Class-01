import { IsString, IsOptional, IsBoolean, IsEnum, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { PlatformType } from '@prisma/client';
import { Transform } from 'class-transformer';

/**
 * 创建 MT 服务器配置 DTO
 */
export class CreateMtServerConfigDto {
  @ApiProperty({ description: '服务器标识符 (租户内唯一)', example: 'demo-mt5-01' })
  @IsString()
  @IsNotEmpty()
  serverId: string;

  @ApiPropertyOptional({ description: '显示名称', example: 'Demo MT5 Server' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiProperty({
    description: '平台类型',
    enum: PlatformType,
    example: PlatformType.MT5,
  })
  @IsEnum(PlatformType)
  platformType: PlatformType;

  @ApiProperty({ description: '中间件 URL', example: 'http://localhost:8080' })
  @IsString()
  @IsNotEmpty()
  middlewareUrl: string;

  @ApiProperty({ description: 'MT 服务器地址 (含端口)', example: '192.168.1.100:443' })
  @IsString()
  @IsNotEmpty()
  serverAddress: string;

  @ApiProperty({ description: '管理员登录账号', example: '10007' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/, { message: 'managerLogin 必须为数字' })
  managerLogin: string;

  @ApiProperty({ description: '管理员密码 (将被加密存储)', example: 'password123' })
  @IsString()
  @IsNotEmpty()
  managerPassword: string;

  @ApiPropertyOptional({ description: '是否启用', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: '是否设为默认服务器', default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/**
 * 更新 MT 服务器配置 DTO
 * 排除 serverId 和 platformType (创建后不可更改)
 */
export class UpdateMtServerConfigDto extends PartialType(
  OmitType(CreateMtServerConfigDto, ['serverId', 'platformType'] as const),
) {}

/**
 * MT 服务器配置响应 DTO
 */
export class MtServerConfigResponseDto {
  @ApiProperty({ description: '服务器 ID' })
  id: string;

  @ApiProperty({ description: '租户 ID' })
  tenantId: string;

  @ApiProperty({ description: '服务器标识符' })
  serverId: string;

  @ApiPropertyOptional({ description: '显示名称' })
  displayName?: string;

  @ApiProperty({ description: '平台类型', enum: PlatformType })
  platformType: PlatformType;

  @ApiProperty({ description: '中间件 URL' })
  middlewareUrl: string;

  @ApiProperty({ description: 'MT 服务器地址' })
  serverAddress: string;

  @ApiProperty({ description: '管理员登录账号' })
  managerLogin: string;

  @ApiProperty({ description: '管理员密码 (已掩码)' })
  managerPassword: string; // 返回时显示为 '******'

  @ApiProperty({ description: '是否启用' })
  isActive: boolean;

  @ApiProperty({ description: '是否默认服务器' })
  isDefault: boolean;

  @ApiProperty({ description: '配置版本号' })
  configVersion: number;

  @ApiProperty({ description: '最后修改时间' })
  lastModifiedAt: Date;

  @ApiPropertyOptional({ description: '最后修改人' })
  lastModifiedBy?: string;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}

/**
 * MT 服务器配置列表响应 DTO
 */
export class MtServerConfigListResponseDto {
  @ApiProperty({ type: [MtServerConfigResponseDto] })
  items: MtServerConfigResponseDto[];

  @ApiProperty({ description: '总数' })
  total: number;
}

/**
 * 查询 MT 服务器配置 DTO
 */
export class QueryMtServerConfigDto {
  @ApiPropertyOptional({ description: '平台类型', enum: PlatformType })
  @IsOptional()
  @IsEnum(PlatformType)
  platformType?: PlatformType;

  @ApiPropertyOptional({ description: '是否启用' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: '搜索关键词' })
  @IsOptional()
  @IsString()
  search?: string;
}
