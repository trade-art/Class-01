import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsUUID,
  IsNumber,
  IsDate,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum InvoiceStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

/**
 * 发票明细项
 */
export class InvoiceLineItemDto {
  @ApiProperty({ example: '专业版订阅 - 月费' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 299 })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiProperty({ example: 299 })
  @IsNumber()
  amount: number;
}

/**
 * 创建发票 DTO
 */
export class CreateInvoiceDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  @IsNotEmpty()
  tenantId: string;

  @ApiProperty({ type: [InvoiceLineItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineItemDto)
  items: InvoiceLineItemDto[];

  @ApiProperty({ description: '计费周期开始日期' })
  @IsDate()
  @Type(() => Date)
  periodStart: Date;

  @ApiProperty({ description: '计费周期结束日期' })
  @IsDate()
  @Type(() => Date)
  periodEnd: Date;

  @ApiProperty({ description: '到期日期' })
  @IsDate()
  @Type(() => Date)
  dueDate: Date;

  @ApiPropertyOptional({ example: 'USD' })
  @IsString()
  @IsOptional()
  currency?: string = 'USD';

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

/**
 * 更新发票状态 DTO
 */
export class UpdateInvoiceStatusDto {
  @ApiProperty({ enum: InvoiceStatus })
  @IsEnum(InvoiceStatus)
  @IsNotEmpty()
  status: InvoiceStatus;

  @ApiPropertyOptional({ description: '支付时间 (状态为 PAID 时需要)' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  paidAt?: Date;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

/**
 * 发票查询 DTO
 */
export class InvoiceQueryDto {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  tenantId?: string;

  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsEnum(InvoiceStatus)
  @IsOptional()
  status?: InvoiceStatus;

  @ApiPropertyOptional({ description: '发票号搜索' })
  @IsString()
  @IsOptional()
  invoiceNo?: string;

  @ApiPropertyOptional({ description: '开始日期' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  fromDate?: Date;

  @ApiPropertyOptional({ description: '结束日期' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  toDate?: Date;

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
 * 发票响应 DTO
 */
export class InvoiceResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  invoiceNo: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  periodStart: Date;

  @ApiProperty()
  periodEnd: Date;

  @ApiProperty({ enum: InvoiceStatus })
  status: InvoiceStatus;

  @ApiPropertyOptional()
  paidAt?: Date;

  @ApiProperty()
  dueDate: Date;

  @ApiPropertyOptional()
  items?: InvoiceLineItemDto[];

  @ApiPropertyOptional()
  notes?: string;

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
    email: string;
  };
}

/**
 * 发票统计 DTO
 */
export class InvoiceStatsDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  pending: number;

  @ApiProperty()
  paid: number;

  @ApiProperty()
  overdue: number;

  @ApiProperty()
  cancelled: number;

  @ApiProperty()
  totalAmount: number;

  @ApiProperty()
  paidAmount: number;

  @ApiProperty()
  pendingAmount: number;

  @ApiProperty()
  overdueAmount: number;
}
