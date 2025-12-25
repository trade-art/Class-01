import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  MtServerService,
  MtServerDto,
  MtServerListResponseDto as ServiceMtServerListResponseDto,
  MtServerQuotaDto,
  ConnectionTestResult,
} from '../middleware-proxy/services/mt-server.service';
import {
  CreateMtServerRequestDto,
  UpdateMtServerRequestDto,
  ToggleServerStatusDto,
  MtServerListResponseDto,
  MtServerResponseDto,
  ConnectionTestResponseDto,
} from './dto';

/**
 * MT 服务器配置管理控制器
 *
 * 租户管理员可以管理自己的 MT 服务器配置。
 * 操作受租户订阅套餐限制（服务器数量、平台类型）。
 */
@ApiTags('MT Servers')
@ApiBearerAuth()
@Controller('mt-servers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MtServerController {
  constructor(private readonly mtServerService: MtServerService) {}

  /**
   * 获取 MT 服务器列表
   */
  @Get()
  @ApiOperation({ summary: '获取 MT 服务器列表' })
  @ApiResponse({
    status: 200,
    description: '成功返回服务器列表',
  })
  async getServers(
    @CurrentUser('tenantId') tenantId: string,
  ): Promise<MtServerListResponseDto> {
    return this.mtServerService.getServers(tenantId);
  }

  /**
   * 获取 MT 服务器配额信息
   */
  @Get('quota')
  @ApiOperation({ summary: '获取 MT 服务器配额信息' })
  @ApiResponse({
    status: 200,
    description: '返回配额信息',
  })
  async getQuota(
    @CurrentUser('tenantId') tenantId: string,
  ): Promise<MtServerQuotaDto> {
    return this.mtServerService.getQuota(tenantId);
  }

  /**
   * 获取默认 MT 服务器
   */
  @Get('default/server')
  @ApiOperation({ summary: '获取默认 MT 服务器' })
  @ApiResponse({
    status: 200,
    description: '返回默认服务器',
  })
  @ApiResponse({ status: 404, description: '没有可用的默认服务器' })
  async getDefaultServer(
    @CurrentUser('tenantId') tenantId: string,
  ): Promise<MtServerDto | null> {
    return this.mtServerService.getDefaultServer(tenantId);
  }

  /**
   * 获取单个 MT 服务器详情
   */
  @Get(':serverId')
  @ApiOperation({ summary: '获取单个 MT 服务器详情' })
  @ApiParam({ name: 'serverId', description: '服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '成功返回服务器详情',
  })
  @ApiResponse({ status: 404, description: '服务器不存在' })
  async getServer(
    @CurrentUser('tenantId') tenantId: string,
    @Param('serverId') serverId: string,
  ): Promise<MtServerDto> {
    return this.mtServerService.getServer(tenantId, serverId);
  }

  /**
   * 创建 MT 服务器
   * 需要 owner 或 admin 角色权限
   */
  @Post()
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '创建 MT 服务器' })
  @ApiResponse({
    status: 201,
    description: '创建成功',
    type: MtServerResponseDto,
  })
  @ApiResponse({ status: 400, description: '参数验证失败或超出配额限制' })
  @ApiResponse({ status: 409, description: '服务器 ID 已存在' })
  async createServer(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateMtServerRequestDto,
  ): Promise<MtServerDto> {
    return this.mtServerService.createServer(tenantId, dto);
  }

  /**
   * 更新 MT 服务器
   * 需要 owner 或 admin 角色权限
   */
  @Put(':serverId')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '更新 MT 服务器' })
  @ApiParam({ name: 'serverId', description: '服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '更新成功',
    type: MtServerResponseDto,
  })
  @ApiResponse({ status: 404, description: '服务器不存在' })
  async updateServer(
    @CurrentUser('tenantId') tenantId: string,
    @Param('serverId') serverId: string,
    @Body() dto: UpdateMtServerRequestDto,
  ): Promise<MtServerDto> {
    return this.mtServerService.updateServer(tenantId, serverId, dto);
  }

  /**
   * 删除 MT 服务器
   * 需要 owner 或 admin 角色权限
   */
  @Delete(':serverId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '删除 MT 服务器' })
  @ApiParam({ name: 'serverId', description: '服务器 ID' })
  @ApiResponse({ status: 204, description: '删除成功' })
  @ApiResponse({ status: 404, description: '服务器不存在' })
  async deleteServer(
    @CurrentUser('tenantId') tenantId: string,
    @Param('serverId') serverId: string,
  ): Promise<void> {
    return this.mtServerService.deleteServer(tenantId, serverId);
  }

  /**
   * 测试 MT 服务器连接
   */
  @Post(':serverId/test-connection')
  @ApiOperation({ summary: '测试 MT 服务器连接' })
  @ApiParam({ name: 'serverId', description: '服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '连接测试结果',
  })
  @ApiResponse({ status: 404, description: '服务器不存在' })
  async testConnection(
    @CurrentUser('tenantId') tenantId: string,
    @Param('serverId') serverId: string,
  ): Promise<ConnectionTestResult> {
    return this.mtServerService.testConnection(tenantId, serverId);
  }

  /**
   * 设置默认 MT 服务器
   * 需要 owner 或 admin 角色权限
   */
  @Post(':serverId/set-default')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '设置默认 MT 服务器' })
  @ApiParam({ name: 'serverId', description: '服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '设置成功',
    type: MtServerResponseDto,
  })
  @ApiResponse({ status: 404, description: '服务器不存在或未激活' })
  async setDefault(
    @CurrentUser('tenantId') tenantId: string,
    @Param('serverId') serverId: string,
  ): Promise<MtServerDto> {
    return this.mtServerService.setDefaultServer(tenantId, serverId);
  }

  /**
   * 切换 MT 服务器状态
   * 需要 owner 或 admin 角色权限
   */
  @Post(':serverId/toggle-status')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '切换 MT 服务器启用状态' })
  @ApiParam({ name: 'serverId', description: '服务器 ID' })
  @ApiResponse({
    status: 200,
    description: '切换成功',
    type: MtServerResponseDto,
  })
  @ApiResponse({ status: 404, description: '服务器不存在' })
  async toggleStatus(
    @CurrentUser('tenantId') tenantId: string,
    @Param('serverId') serverId: string,
    @Body() dto: ToggleServerStatusDto,
  ): Promise<MtServerDto> {
    return this.mtServerService.toggleServerStatus(tenantId, serverId, dto.isActive);
  }
}
