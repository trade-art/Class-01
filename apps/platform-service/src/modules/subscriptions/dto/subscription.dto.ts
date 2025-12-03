import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsUUID,
  IsDate,
  Min,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

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

/**
 * 订阅计划配置 DTO
 */
export class PlanConfigDto {
  @ApiProperty({ enum: SubscriptionPlan })
  plan: SubscriptionPlan;

  @ApiProperty({ description: '月费价格' })
  @IsNumber()
  monthlyPrice: number;

  @ApiProperty({ description: '季度价格 (折扣)' })
  @IsNumber()
  quarterlyPrice: number;

  @ApiProperty({ description: '年费价格 (折扣)' })
  @IsNumber()
  yearlyPrice: number;

  @ApiProperty({ description: '最大实例数' })
  @IsInt()
  @Min(1)
  maxInstances: number;

  @ApiProperty({ description: '最大管理员数' })
  @IsInt()
  @Min(1)
  maxAdmins: number;

  @ApiProperty({ description: '功能列表' })
  features: string[];
}

/**
 * 创建/更新订阅请求 DTO
 */
export class UpdateSubscriptionDto {
  @ApiProperty({ enum: SubscriptionPlan })
  @IsEnum(SubscriptionPlan)
  @IsNotEmpty()
  plan: SubscriptionPlan;

  @ApiProperty({ enum: BillingCycle })
  @IsEnum(BillingCycle)
  @IsNotEmpty()
  billingCycle: BillingCycle;

  @ApiPropertyOptional({ description: '自定义实例上限' })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxInstances?: number;

  @ApiPropertyOptional({ description: '自定义管理员上限' })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxAdmins?: number;
}

/**
 * 订阅变更记录
 */
export class SubscriptionChangeDto {
  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  fromPlan: SubscriptionPlan;

  @ApiProperty()
  toPlan: SubscriptionPlan;

  @ApiProperty()
  changedAt: Date;

  @ApiProperty()
  changedBy: string;

  @ApiPropertyOptional()
  reason?: string;
}

/**
 * 订阅状态响应 DTO
 */
export class SubscriptionStatusDto {
  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  tenantName: string;

  @ApiProperty({ enum: SubscriptionPlan })
  currentPlan: SubscriptionPlan;

  @ApiProperty({ enum: BillingCycle })
  billingCycle: BillingCycle;

  @ApiProperty({ description: '实例配额' })
  instanceQuota: {
    used: number;
    max: number;
    available: number;
  };

  @ApiProperty({ description: '管理员配额' })
  adminQuota: {
    used: number;
    max: number;
    available: number;
  };

  @ApiPropertyOptional({ description: '订阅到期时间' })
  expiresAt?: Date;

  @ApiProperty({ description: '是否即将到期 (30天内)' })
  isExpiringSoon: boolean;

  @ApiProperty({ description: '剩余天数' })
  daysRemaining?: number;
}

/**
 * 订阅升级/降级预览
 */
export class SubscriptionChangePreviewDto {
  @ApiProperty()
  tenantId: string;

  @ApiProperty({ enum: SubscriptionPlan })
  currentPlan: SubscriptionPlan;

  @ApiProperty({ enum: SubscriptionPlan })
  targetPlan: SubscriptionPlan;

  @ApiProperty({ description: '是否为升级' })
  isUpgrade: boolean;

  @ApiProperty({ description: '价格差额' })
  priceDifference: number;

  @ApiProperty({ description: '按比例计算的金额 (升级时)' })
  proratedAmount?: number;

  @ApiProperty({ description: '配额变更' })
  quotaChanges: {
    instances: { from: number; to: number };
    admins: { from: number; to: number };
  };

  @ApiProperty({ description: '是否需要立即支付' })
  requiresImmediatePayment: boolean;

  @ApiPropertyOptional({ description: '警告信息' })
  warnings?: string[];
}

/**
 * 订阅查询 DTO
 */
export class SubscriptionQueryDto {
  @ApiPropertyOptional({ enum: SubscriptionPlan })
  @IsEnum(SubscriptionPlan)
  @IsOptional()
  plan?: SubscriptionPlan;

  @ApiPropertyOptional({ description: '是否即将到期' })
  @IsOptional()
  expiringSoon?: boolean;

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
