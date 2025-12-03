import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsUUID,
  IsEmail,
  IsBoolean,
  MinLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum TenantRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
}

/**
 * 创建租户管理员 DTO
 */
export class CreateTenantAdminDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  @IsNotEmpty()
  tenantId: string;

  @ApiProperty({ example: 'admin@tenant.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'securepassword123', minLength: 8 })
  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({ enum: TenantRole, default: TenantRole.ADMIN })
  @IsEnum(TenantRole)
  @IsOptional()
  role?: TenantRole = TenantRole.ADMIN;
}

/**
 * 更新租户管理员 DTO
 */
export class UpdateTenantAdminDto {
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ enum: TenantRole })
  @IsEnum(TenantRole)
  @IsOptional()
  role?: TenantRole;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

/**
 * 修改密码 DTO
 */
export class ChangePasswordDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  newPassword: string;
}

/**
 * 租户管理员查询 DTO
 */
export class TenantAdminQueryDto {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: TenantRole })
  @IsEnum(TenantRole)
  @IsOptional()
  role?: TenantRole;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}

/**
 * 租户管理员响应 DTO
 */
export class TenantAdminResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: TenantRole })
  role: TenantRole;

  @ApiProperty()
  isActive: boolean;

  @ApiPropertyOptional()
  lastLogin?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  // 关联租户信息
  @ApiPropertyOptional()
  tenant?: {
    id: string;
    name: string;
    code: string;
  };
}

/**
 * 批量创建管理员 DTO
 */
export class BulkCreateTenantAdminsDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  @IsNotEmpty()
  tenantId: string;

  @ApiProperty({ type: [CreateTenantAdminDto] })
  admins: Omit<CreateTenantAdminDto, 'tenantId'>[];
}
