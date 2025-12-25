import { IsString, IsNotEmpty, IsUUID, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 分配租户到中间件 DTO
 */
export class AssignTenantDto {
  @ApiProperty({ description: '租户 ID' })
  @IsUUID()
  @IsNotEmpty()
  tenantId: string;

  @ApiPropertyOptional({ description: '分配备注' })
  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * 取消分配 DTO
 */
export class UnassignTenantDto {
  @ApiProperty({ description: '租户 ID' })
  @IsUUID()
  @IsNotEmpty()
  tenantId: string;
}

/**
 * 中间件分配响应 DTO
 */
export class MiddlewareAssignmentResponseDto {
  @ApiProperty({ description: '分配记录 ID' })
  id: string;

  @ApiProperty({ description: '中间件 ID' })
  middlewareId: string;

  @ApiProperty({ description: '租户 ID' })
  tenantId: string;

  @ApiProperty({ description: '分配时间' })
  assignedAt: Date;

  @ApiProperty({ description: '分配人 ID' })
  assignedBy: string;

  @ApiPropertyOptional({ description: '租户信息' })
  tenant?: {
    id: string;
    name: string;
    code: string;
  };

  @ApiPropertyOptional({ description: '中间件信息' })
  middleware?: {
    id: string;
    name: string;
    url: string;
  };
}

/**
 * 租户的中间件分配信息 DTO
 */
export class TenantMiddlewareInfoDto {
  @ApiProperty({ description: '中间件 ID' })
  middlewareId: string;

  @ApiProperty({ description: '中间件名称' })
  middlewareName: string;

  @ApiProperty({ description: '中间件 URL' })
  middlewareUrl: string;

  @ApiProperty({ description: '分配时间' })
  assignedAt: Date;

  @ApiProperty({ description: '是否有 MT 服务器配置' })
  hasMtServerConfig: boolean;
}

/**
 * 中间件容量信息 DTO
 */
export class MiddlewareCapacityDto {
  @ApiProperty({ description: '中间件 ID' })
  id: string;

  @ApiProperty({ description: '中间件名称' })
  name: string;

  @ApiProperty({ description: '分配模式' })
  assignmentMode: string;

  @ApiProperty({ description: '最大租户数' })
  maxTenants: number;

  @ApiProperty({ description: '当前租户数' })
  currentTenants: number;

  @ApiProperty({ description: '剩余容量' })
  availableSlots: number;

  @ApiProperty({ description: '是否可分配' })
  canAssign: boolean;
}
