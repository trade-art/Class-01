import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { MtServerConfigService } from './mt-server-config.service';
import {
  CreateMtServerConfigDto,
  UpdateMtServerConfigDto,
  QueryMtServerConfigDto,
  MtServerConfigResponseDto,
  MtServerConfigListResponseDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';

/**
 * MT 服务器配置控制器
 * 由 SaaS 管理员管理租户的 MT5/MT4 服务器配置
 */
@ApiTags('MT 服务器配置管理')
@ApiBearerAuth()
@Controller('tenants/:tenantId/mt-servers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class MtServerConfigController {
  constructor(private readonly mtServerConfigService: MtServerConfigService) {}

  /**
   * 创建 MT 服务器配置
   */
  @Post()
  @ApiOperation({
    summary: '创建 MT 服务器配置',
    description: '为指定租户创建 MT5/MT4 服务器配置',
  })
  @ApiParam({ name: 'tenantId', description: '租户 ID' })
  @ApiResponse({
    status: 201,
    description: '创建成功',
    type: MtServerConfigResponseDto,
  })
  @ApiResponse({ status: 404, description: '租户不存在' })
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateMtServerConfigDto,
    @Request() req: { user: { sub: string } },
  ): Promise<MtServerConfigResponseDto> {
    return this.mtServerConfigService.create(tenantId, dto, req.user.sub);
  }

  /**
   * 获取租户的 MT 服务器配置列表
   */
  @Get()
  @ApiOperation({
    summary: '获取 MT 服务器列表',
    description: '获取指定租户的所有 MT 服务器配置',
  })
  @ApiParam({ name: 'tenantId', description: '租户 ID' })
  @ApiResponse({
    status: 200,
    description: 'MT 服务器列表',
    type: MtServerConfigListResponseDto,
  })
  async findAll(
    @Param('tenantId') tenantId: string,
    @Query() query: QueryMtServerConfigDto,
  ): Promise<MtServerConfigListResponseDto> {
    return this.mtServerConfigService.findAllByTenant(tenantId, query);
  }

  /**
   * 获取单个 MT 服务器配置
   */
  @Get(':serverId')
  @ApiOperation({
    summary: '获取 MT 服务器详情',
    description: '获取指定 MT 服务器的配置详情',
  })
  @ApiParam({ name: 'tenantId', description: '租户 ID' })
  @ApiParam({ name: 'serverId', description: '服务器 ID' })
  @ApiResponse({
    status: 200,
    description: 'MT 服务器详情',
    type: MtServerConfigResponseDto,
  })
  @ApiResponse({ status: 404, description: '配置不存在' })
  async findOne(
    @Param('tenantId') tenantId: string,
    @Param('serverId') serverId: string,
  ): Promise<MtServerConfigResponseDto> {
    return this.mtServerConfigService.findOne(tenantId, serverId);
  }

  /**
   * 更新 MT 服务器配置
   */
  @Put(':serverId')
  @ApiOperation({
    summary: '更新 MT 服务器配置',
    description: '更新指定 MT 服务器的配置（每次更新会增加版本号）',
  })
  @ApiParam({ name: 'tenantId', description: '租户 ID' })
  @ApiParam({ name: 'serverId', description: '服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '更新成功',
    type: MtServerConfigResponseDto,
  })
  @ApiResponse({ status: 404, description: '配置不存在' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('serverId') serverId: string,
    @Body() dto: UpdateMtServerConfigDto,
    @Request() req: { user: { sub: string } },
  ): Promise<MtServerConfigResponseDto> {
    return this.mtServerConfigService.update(tenantId, serverId, dto, req.user.sub);
  }

  /**
   * 删除 MT 服务器配置
   */
  @Delete(':serverId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '删除 MT 服务器配置',
    description: '删除指定 MT 服务器的配置',
  })
  @ApiParam({ name: 'tenantId', description: '租户 ID' })
  @ApiParam({ name: 'serverId', description: '服务器 ID' })
  @ApiResponse({ status: 204, description: '删除成功' })
  @ApiResponse({ status: 404, description: '配置不存在' })
  async remove(
    @Param('tenantId') tenantId: string,
    @Param('serverId') serverId: string,
  ): Promise<void> {
    return this.mtServerConfigService.remove(tenantId, serverId);
  }
}
