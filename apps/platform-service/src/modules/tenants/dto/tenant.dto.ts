import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  MaxLength,
  Matches,
} from 'class-validator';

export enum TenantStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum SubscriptionPlan {
  TRIAL = 'TRIAL',
  BASIC = 'BASIC',
  PROFESSIONAL = 'PROFESSIONAL',
  ENTERPRISE = 'ENTERPRISE',
}

export enum BillingCycle {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  YEARLY = 'YEARLY',
}

export class CreateTenantDto {
  @ApiProperty({ example: 'Acme Trading Inc.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'acme', description: 'Unique tenant code (lowercase, alphanumeric)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[a-z0-9_-]+$/, {
    message: 'Code must be lowercase alphanumeric with underscores or hyphens',
  })
  code: string;

  @ApiProperty({ example: 'contact@acmetrading.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ example: '+1234567890' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'Acme Trading Corporation' })
  @IsString()
  @IsOptional()
  company?: string;

  @ApiPropertyOptional({ enum: SubscriptionPlan })
  @IsEnum(SubscriptionPlan)
  @IsOptional()
  plan?: SubscriptionPlan;

  @ApiPropertyOptional({ example: 5, description: 'Maximum middleware instances' })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxInstances?: number;

  @ApiPropertyOptional({ example: 10, description: 'Maximum tenant admins' })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxAdmins?: number;

  @ApiPropertyOptional({ enum: BillingCycle })
  @IsEnum(BillingCycle)
  @IsOptional()
  billingCycle?: BillingCycle;

  @ApiPropertyOptional()
  @IsEmail()
  @IsOptional()
  billingEmail?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateTenantDto extends PartialType(CreateTenantDto) {
  @ApiPropertyOptional({ enum: TenantStatus })
  @IsEnum(TenantStatus)
  @IsOptional()
  status?: TenantStatus;
}

export class TenantQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: TenantStatus })
  @IsEnum(TenantStatus)
  @IsOptional()
  status?: TenantStatus;

  @ApiPropertyOptional({ enum: SubscriptionPlan })
  @IsEnum(SubscriptionPlan)
  @IsOptional()
  plan?: SubscriptionPlan;

  @ApiPropertyOptional({ default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number = 20;
}

export class TenantResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional()
  phone?: string;

  @ApiPropertyOptional()
  company?: string;

  @ApiProperty({ enum: TenantStatus })
  status: TenantStatus;

  @ApiProperty({ enum: SubscriptionPlan })
  plan: SubscriptionPlan;

  @ApiProperty()
  maxInstances: number;

  @ApiProperty()
  maxAdmins: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class PaginatedTenantsResponseDto {
  @ApiProperty({ type: [TenantResponseDto] })
  data: TenantResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

/**
 * 白标配置更新 DTO (REQ-3)
 */
export class UpdateBrandingDto {
  @ApiPropertyOptional({
    example: 'My Trading Platform',
    description: '自定义显示名称',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/logo.png',
    description: 'Logo URL',
  })
  @IsString()
  @IsOptional()
  @Matches(/^(https?:\/\/|\/|$)/, {
    message: 'logoUrl must be a valid URL or empty',
  })
  logoUrl?: string;

  @ApiPropertyOptional({
    example: '#3B82F6',
    description: '主题色 (十六进制格式)',
  })
  @IsString()
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'primaryColor must be a valid hex color (e.g., #3B82F6)',
  })
  primaryColor?: string;
}

/**
 * 白标配置响应 DTO
 */
export class BrandingResponseDto {
  @ApiPropertyOptional()
  displayName?: string;

  @ApiPropertyOptional()
  logo?: string;

  @ApiPropertyOptional()
  primaryColor?: string;
}
