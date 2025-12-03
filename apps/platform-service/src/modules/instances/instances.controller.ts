import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { InstancesService } from './instances.service';
import {
  CreateInstanceDto,
  UpdateInstanceDto,
  InstanceQueryDto,
  InstanceResponseDto,
  MT5ServerConfigDto,
} from './dto/instance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, UserTypes } from '../auth/guards/roles.guard';
import { UserType } from '../auth/dto/login.dto';

@ApiTags('instances')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UserTypes(UserType.PLATFORM_ADMIN)
@Controller('instances')
export class InstancesController {
  constructor(private readonly instancesService: InstancesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new middleware instance' })
  @ApiResponse({ status: 201, description: 'Instance created', type: InstanceResponseDto })
  @ApiResponse({ status: 400, description: 'Instance limit reached' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async create(@Body() createInstanceDto: CreateInstanceDto) {
    return this.instancesService.create(createInstanceDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all instances with pagination' })
  @ApiResponse({ status: 200, description: 'List of instances' })
  async findAll(@Query() query: InstanceQueryDto) {
    return this.instancesService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get instance statistics' })
  @ApiResponse({ status: 200, description: 'Instance statistics' })
  async getStats() {
    return this.instancesService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get instance by ID' })
  @ApiParam({ name: 'id', description: 'Instance ID' })
  @ApiResponse({ status: 200, description: 'Instance details', type: InstanceResponseDto })
  @ApiResponse({ status: 404, description: 'Instance not found' })
  async findOne(@Param('id') id: string) {
    return this.instancesService.findOne(id);
  }

  @Get('tenant/:tenantId')
  @ApiOperation({ summary: 'Get all instances for a tenant' })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: 'List of tenant instances' })
  async findByTenant(@Param('tenantId') tenantId: string) {
    return this.instancesService.findByTenant(tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update instance' })
  @ApiParam({ name: 'id', description: 'Instance ID' })
  @ApiResponse({ status: 200, description: 'Instance updated', type: InstanceResponseDto })
  @ApiResponse({ status: 404, description: 'Instance not found' })
  async update(@Param('id') id: string, @Body() updateInstanceDto: UpdateInstanceDto) {
    return this.instancesService.update(id, updateInstanceDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete instance' })
  @ApiParam({ name: 'id', description: 'Instance ID' })
  @ApiResponse({ status: 204, description: 'Instance deleted' })
  @ApiResponse({ status: 404, description: 'Instance not found' })
  async remove(@Param('id') id: string) {
    return this.instancesService.remove(id);
  }

  @Post(':id/regenerate-key')
  @ApiOperation({ summary: 'Regenerate instance API key' })
  @ApiParam({ name: 'id', description: 'Instance ID' })
  @ApiResponse({ status: 200, description: 'New API key generated' })
  @ApiResponse({ status: 404, description: 'Instance not found' })
  async regenerateApiKey(@Param('id') id: string) {
    return this.instancesService.regenerateApiKey(id);
  }

  @Post(':id/health-check')
  @ApiOperation({ summary: 'Perform health check on instance' })
  @ApiParam({ name: 'id', description: 'Instance ID' })
  @ApiResponse({ status: 200, description: 'Health check result' })
  @ApiResponse({ status: 404, description: 'Instance not found' })
  async checkHealth(@Param('id') id: string) {
    return this.instancesService.checkHealth(id);
  }

  // ==================== REQ-4: 批量健康检查 ====================

  @Post('health-check/all')
  @ApiOperation({ summary: '检查所有实例健康状态' })
  @ApiResponse({ status: 200, description: '健康检查汇总结果' })
  async checkAllHealth() {
    return this.instancesService.checkAllHealth();
  }

  // ==================== REQ-5: 配额验证 (Task 10) ====================

  @Get('tenant/:tenantId/quota')
  @ApiOperation({ summary: '获取租户配额使用情况' })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: '配额使用情况' })
  async getQuotaUsage(@Param('tenantId') tenantId: string) {
    return this.instancesService.getQuotaUsage(tenantId);
  }

  // ==================== REQ-6: MT5 服务器配置 (Task 11) ====================

  @Get(':id/mt5-servers')
  @ApiOperation({ summary: '获取实例 MT5 服务器配置' })
  @ApiParam({ name: 'id', description: 'Instance ID' })
  @ApiResponse({ status: 200, description: 'MT5 服务器列表' })
  async getMT5Servers(@Param('id') id: string) {
    return this.instancesService.getMT5Servers(id);
  }

  @Patch(':id/mt5-servers')
  @ApiOperation({ summary: '更新实例 MT5 服务器配置' })
  @ApiParam({ name: 'id', description: 'Instance ID' })
  @ApiResponse({ status: 200, description: 'MT5 服务器配置已更新' })
  async updateMT5Servers(
    @Param('id') id: string,
    @Body() servers: MT5ServerConfigDto[],
  ) {
    return this.instancesService.updateMT5Servers(id, servers);
  }

  @Post(':id/mt5-servers')
  @ApiOperation({ summary: '添加 MT5 服务器' })
  @ApiParam({ name: 'id', description: 'Instance ID' })
  @ApiResponse({ status: 201, description: 'MT5 服务器已添加' })
  async addMT5Server(
    @Param('id') id: string,
    @Body() server: MT5ServerConfigDto,
  ) {
    return this.instancesService.addMT5Server(id, server);
  }

  @Delete(':id/mt5-servers/:serverName')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '移除 MT5 服务器' })
  @ApiParam({ name: 'id', description: 'Instance ID' })
  @ApiParam({ name: 'serverName', description: 'MT5 Server Name' })
  @ApiResponse({ status: 204, description: 'MT5 服务器已移除' })
  async removeMT5Server(
    @Param('id') id: string,
    @Param('serverName') serverName: string,
  ) {
    return this.instancesService.removeMT5Server(id, serverName);
  }

  @Post(':id/mt5-servers/:serverName/set-default')
  @ApiOperation({ summary: '设置默认 MT5 服务器' })
  @ApiParam({ name: 'id', description: 'Instance ID' })
  @ApiParam({ name: 'serverName', description: 'MT5 Server Name' })
  @ApiResponse({ status: 200, description: '默认服务器已设置' })
  async setDefaultMT5Server(
    @Param('id') id: string,
    @Param('serverName') serverName: string,
  ) {
    return this.instancesService.setDefaultMT5Server(id, serverName);
  }

  @Post(':id/mt5-servers/:serverName/test')
  @ApiOperation({ summary: '测试 MT5 服务器连接' })
  @ApiParam({ name: 'id', description: 'Instance ID' })
  @ApiParam({ name: 'serverName', description: 'MT5 Server Name' })
  @ApiResponse({ status: 200, description: '连接测试结果' })
  async testMT5ServerConnection(
    @Param('id') id: string,
    @Param('serverName') serverName: string,
  ) {
    return this.instancesService.testMT5ServerConnection(id, serverName);
  }
}
