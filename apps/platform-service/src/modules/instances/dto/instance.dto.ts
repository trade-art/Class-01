import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsUrl,
  IsUUID,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum InstanceStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  MAINTENANCE = 'MAINTENANCE',
  ERROR = 'ERROR',
}

export class MT5ServerConfigDto {
  @ApiProperty({ example: 'Primary Server' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '192.168.1.100' })
  @IsString()
  @IsNotEmpty()
  host: string;

  @ApiProperty({ example: 443 })
  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isDefault?: boolean;
}

export class CreateInstanceDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  @IsNotEmpty()
  tenantId: string;

  @ApiProperty({ example: 'Production Instance' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Main production middleware instance' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'middleware.example.com' })
  @IsString()
  @IsNotEmpty()
  host: string;

  @ApiPropertyOptional({ example: 8080, default: 8080 })
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  port?: number = 8080;

  @ApiPropertyOptional({ type: [MT5ServerConfigDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MT5ServerConfigDto)
  @IsOptional()
  mt5Servers?: MT5ServerConfigDto[];

  @ApiPropertyOptional({ example: 100, default: 100 })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxSessions?: number;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxManagers?: number;
}

export class UpdateInstanceDto extends PartialType(CreateInstanceDto) {
  @ApiPropertyOptional({ enum: InstanceStatus })
  @IsEnum(InstanceStatus)
  @IsOptional()
  status?: InstanceStatus;
}

export class InstanceQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  tenantId?: string;

  @ApiPropertyOptional({ enum: InstanceStatus })
  @IsEnum(InstanceStatus)
  @IsOptional()
  status?: InstanceStatus;

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

export class InstanceResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  host: string;

  @ApiProperty()
  port: number;

  @ApiProperty()
  apiKey: string;

  @ApiProperty({ enum: InstanceStatus })
  status: InstanceStatus;

  @ApiPropertyOptional()
  lastHealthCheck?: Date;

  @ApiProperty()
  maxSessions: number;

  @ApiProperty()
  maxManagers: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class HealthCheckResponseDto {
  @ApiProperty()
  status: string;

  @ApiProperty()
  uptime: number;

  @ApiProperty()
  activeSessions: number;

  @ApiProperty()
  totalConnections: number;

  @ApiProperty()
  memory: {
    used: number;
    total: number;
  };
}
