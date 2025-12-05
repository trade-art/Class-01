import { Controller, Get, Query, Param, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Public } from '../auth/decorators/public.decorator';
import { TenantService, TenantConfig, DeploymentConfig, DeploymentMode } from './tenant.service';

/**
 * 租户查询 DTO
 */
class TenantResolveQueryDto {
  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsString()
  code?: string;
}

/**
 * 租户配置响应 DTO
 */
class TenantConfigResponseDto {
  id: string;
  code: string;
  name: string;
  displayName?: string;
  logo?: string;
  favicon?: string;
  primaryColor?: string;
  platformType?: string;
  servers?: {
    serverId: string;
    displayName: string;
    platformType: string;
    isDefault: boolean;
  }[];
}

/**
 * 部署配置响应 DTO
 */
class DeploymentConfigResponseDto {
  tenantId: string;
  tenantCode: string;
  deploymentMode: DeploymentMode;
  middlewareEndpoints: {
    serverId: string;
    platformType: string;
    middlewareUrl: string;
    isDefault: boolean;
  }[];
  defaultMiddlewareUrl?: string;
}

/**
 * 租户查询控制器
 * 提供公开的租户识别 API
 * 用于前端在登录前识别租户配置
 */
@ApiTags('Tenant')
@Controller('tenant')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get('resolve')
  @Public()
  @ApiOperation({ summary: '解析租户配置' })
  @ApiQuery({ name: 'domain', required: false, description: '域名' })
  @ApiQuery({ name: 'code', required: false, description: '租户代码' })
  @ApiResponse({
    status: 200,
    description: '租户配置（不含敏感信息）',
    type: TenantConfigResponseDto,
  })
  @ApiResponse({ status: 404, description: '租户不存在' })
  async resolveTenant(@Query() query: TenantResolveQueryDto): Promise<TenantConfig> {
    let tenant: TenantConfig | null = null;

    if (query.domain) {
      tenant = await this.tenantService.getTenantByDomain(query.domain);
    } else if (query.code) {
      tenant = await this.tenantService.getTenantByCode(query.code);
    }

    if (!tenant) {
      throw new NotFoundException('租户不存在或未激活');
    }

    return tenant;
  }

  @Get('config')
  @Public()
  @ApiOperation({ summary: '通过域名获取租户配置' })
  @ApiQuery({ name: 'domain', required: true, description: '完整域名' })
  @ApiResponse({
    status: 200,
    description: '租户配置',
    type: TenantConfigResponseDto,
  })
  @ApiResponse({ status: 404, description: '租户不存在' })
  async getTenantConfig(@Query('domain') domain: string): Promise<TenantConfig> {
    const tenant = await this.tenantService.getTenantByDomain(domain);

    if (!tenant) {
      throw new NotFoundException(`无法识别域名 ${domain} 对应的租户`);
    }

    return tenant;
  }

  @Get('deployment/:tenantId')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取租户部署配置（内部 API）' })
  @ApiParam({ name: 'tenantId', description: '租户 ID' })
  @ApiResponse({
    status: 200,
    description: '部署配置（包含中间件 URL）',
    type: DeploymentConfigResponseDto,
  })
  @ApiResponse({ status: 404, description: '租户不存在' })
  async getDeploymentConfig(@Param('tenantId') tenantId: string): Promise<DeploymentConfig> {
    const config = await this.tenantService.getDeploymentConfig(tenantId);

    if (!config) {
      throw new NotFoundException('租户不存在或未激活');
    }

    return config;
  }

  @Get('deployment/code/:code')
  @ApiBearerAuth()
  @ApiOperation({ summary: '通过租户代码获取部署配置' })
  @ApiParam({ name: 'code', description: '租户代码' })
  @ApiResponse({
    status: 200,
    description: '部署配置',
    type: DeploymentConfigResponseDto,
  })
  @ApiResponse({ status: 404, description: '租户不存在' })
  async getDeploymentConfigByCode(@Param('code') code: string): Promise<DeploymentConfig> {
    const config = await this.tenantService.getDeploymentConfigByCode(code);

    if (!config) {
      throw new NotFoundException('租户不存在或未激活');
    }

    return config;
  }
}
