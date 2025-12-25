import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
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
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import {
  MtManagerService,
  MtManagerDto,
  ConnectionTestResult,
} from './mt-manager.service';
import { MtManagerApiKeyService } from './mt-manager-api-key.service';
import { MtManagerAccessTokenService } from './mt-manager-access-token.service';
import {
  CreateMtManagerRequestDto,
  UpdateMtManagerRequestDto,
  ToggleManagerStatusDto,
  ToggleApiKeyDto,
  UpdateApiKeyAllowedIpsDto,
  GenerateApiKeyRequestDto,
  UpdateApiKeyScopesDto,
  AvailableScopesResponseDto,
  MtManagerListResponseDto,
  MtManagerResponseDto,
  ManagerConnectionTestResponseDto,
  GenerateApiKeyResponseDto,
  ApiKeyStatusResponseDto,
  GetApiSecretResponseDto,
  ManagerAccessTokenResponseDto,
} from './dto';

/**
 * MT 经理账号管理控制器
 *
 * 租户管理员可以管理 MT 服务器的经理账号。
 * 每个 MT 服务器可以有多个经理账号，其中一个为默认账号。
 */
@ApiTags('MT Managers')
@ApiBearerAuth()
@Controller('mt-managers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MtManagerController {
  constructor(
    private readonly mtManagerService: MtManagerService,
    private readonly apiKeyService: MtManagerApiKeyService,
    private readonly accessTokenService: MtManagerAccessTokenService,
  ) {}

  /**
   * 获取 MT 经理账号列表
   */
  @Get()
  @ApiOperation({ summary: '获取 MT 经理账号列表' })
  @ApiQuery({
    name: 'serverId',
    required: false,
    description: '按服务器 ID 筛选',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回经理账号列表',
  })
  async getManagers(
    @CurrentUser('tenantId') tenantId: string,
    @Query('serverId') serverId?: string,
  ): Promise<MtManagerListResponseDto> {
    if (serverId) {
      return this.mtManagerService.getManagersByServer(tenantId, serverId);
    }
    return this.mtManagerService.getManagers(tenantId);
  }

  /**
   * 获取可用的作用域列表
   * 注意: 此路由必须放在 :managerId 之前，避免路由冲突
   */
  @Get('api-key/available-scopes')
  @ApiOperation({
    summary: '获取可用的 API Key 作用域列表',
    description: '返回所有可用的权限作用域及其说明，用于创建或更新 API Key 时选择。',
  })
  @ApiResponse({
    status: 200,
    description: '可用作用域列表',
    type: AvailableScopesResponseDto,
  })
  getAvailableScopes(): AvailableScopesResponseDto {
    return this.apiKeyService.getAvailableScopes();
  }

  /**
   * 获取单个 MT 经理账号详情
   */
  @Get(':managerId')
  @ApiOperation({ summary: '获取单个 MT 经理账号详情' })
  @ApiParam({ name: 'managerId', description: '经理账号 UUID' })
  @ApiResponse({
    status: 200,
    description: '成功返回经理账号详情',
  })
  @ApiResponse({ status: 404, description: '经理账号不存在' })
  async getManager(
    @CurrentUser('tenantId') tenantId: string,
    @Param('managerId') managerId: string,
  ): Promise<MtManagerDto> {
    return this.mtManagerService.getManager(tenantId, managerId);
  }

  /**
   * 创建 MT 经理账号
   * 需要 owner 或 admin 角色权限
   */
  @Post()
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '创建 MT 经理账号' })
  @ApiResponse({
    status: 201,
    description: '创建成功',
    type: MtManagerResponseDto,
  })
  @ApiResponse({ status: 400, description: '参数验证失败或超出配额限制' })
  @ApiResponse({ status: 404, description: 'MT 服务器不存在' })
  @ApiResponse({ status: 409, description: '该服务器已存在相同登录号的经理账号' })
  async createManager(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateMtManagerRequestDto,
  ): Promise<MtManagerDto> {
    return this.mtManagerService.createManager(tenantId, dto);
  }

  /**
   * 更新 MT 经理账号
   * 需要 owner 或 admin 角色权限
   */
  @Put(':managerId')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '更新 MT 经理账号' })
  @ApiParam({ name: 'managerId', description: '经理账号 UUID' })
  @ApiResponse({
    status: 200,
    description: '更新成功',
    type: MtManagerResponseDto,
  })
  @ApiResponse({ status: 404, description: '经理账号不存在' })
  async updateManager(
    @CurrentUser('tenantId') tenantId: string,
    @Param('managerId') managerId: string,
    @Body() dto: UpdateMtManagerRequestDto,
  ): Promise<MtManagerDto> {
    return this.mtManagerService.updateManager(tenantId, managerId, dto);
  }

  /**
   * 删除 MT 经理账号
   * 需要 owner 或 admin 角色权限
   */
  @Delete(':managerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '删除 MT 经理账号' })
  @ApiParam({ name: 'managerId', description: '经理账号 UUID' })
  @ApiResponse({ status: 204, description: '删除成功' })
  @ApiResponse({ status: 404, description: '经理账号不存在' })
  async deleteManager(
    @CurrentUser('tenantId') tenantId: string,
    @Param('managerId') managerId: string,
  ): Promise<void> {
    return this.mtManagerService.deleteManager(tenantId, managerId);
  }

  /**
   * 测试 MT 经理账号连接
   */
  @Post(':managerId/test-connection')
  @ApiOperation({ summary: '测试 MT 经理账号连接' })
  @ApiParam({ name: 'managerId', description: '经理账号 UUID' })
  @ApiResponse({
    status: 200,
    description: '连接测试结果',
    type: ManagerConnectionTestResponseDto,
  })
  @ApiResponse({ status: 404, description: '经理账号不存在' })
  async testConnection(
    @CurrentUser('tenantId') tenantId: string,
    @Param('managerId') managerId: string,
  ): Promise<ConnectionTestResult> {
    return this.mtManagerService.testConnection(tenantId, managerId);
  }

  /**
   * 获取 Manager Access Token
   *
   * 为租户后台生成访问指定 Manager 的 Pool Mode Token
   * 该 Token 可用于访问中间件 API，中间件通过 managerId 从连接池获取连接
   *
   * 权限要求: owner, admin 或 operator 角色
   */
  @Post(':managerId/access-token')
  @Roles('owner', 'admin', 'operator')
  @ApiOperation({
    summary: '获取 Manager Access Token',
    description:
      '生成用于访问中间件的 Pool Mode Token。该 Token 包含 managerId，中间件通过 managerId 从连接池获取已建立的 MT5 连接。',
  })
  @ApiParam({ name: 'managerId', description: '经理账号 UUID' })
  @ApiResponse({
    status: 200,
    description: 'Access Token 生成成功',
    type: ManagerAccessTokenResponseDto,
  })
  @ApiResponse({ status: 400, description: '中间件未配置' })
  @ApiResponse({ status: 403, description: '无权访问或中间件未分配' })
  @ApiResponse({ status: 404, description: '经理账号不存在' })
  async getAccessToken(
    @CurrentUser() user: JwtPayload,
    @Param('managerId') managerId: string,
  ): Promise<ManagerAccessTokenResponseDto> {
    return this.accessTokenService.generateAccessToken(
      user.tenantId,
      managerId,
      user.sub,
    );
  }

  /**
   * 设置默认 MT 经理账号
   * 需要 owner 或 admin 角色权限
   */
  @Post(':managerId/set-default')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '设置默认 MT 经理账号' })
  @ApiParam({ name: 'managerId', description: '经理账号 UUID' })
  @ApiResponse({
    status: 200,
    description: '设置成功',
    type: MtManagerResponseDto,
  })
  @ApiResponse({ status: 404, description: '经理账号不存在或未激活' })
  async setDefault(
    @CurrentUser('tenantId') tenantId: string,
    @Param('managerId') managerId: string,
  ): Promise<MtManagerDto> {
    return this.mtManagerService.setDefaultManager(tenantId, managerId);
  }

  /**
   * 切换 MT 经理账号状态
   * 需要 owner 或 admin 角色权限
   */
  @Post(':managerId/toggle-status')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '切换 MT 经理账号启用状态' })
  @ApiParam({ name: 'managerId', description: '经理账号 UUID' })
  @ApiResponse({
    status: 200,
    description: '切换成功',
    type: MtManagerResponseDto,
  })
  @ApiResponse({ status: 404, description: '经理账号不存在' })
  async toggleStatus(
    @CurrentUser('tenantId') tenantId: string,
    @Param('managerId') managerId: string,
    @Body() dto: ToggleManagerStatusDto,
  ): Promise<MtManagerDto> {
    return this.mtManagerService.toggleManagerStatus(
      tenantId,
      managerId,
      dto.isActive,
    );
  }

  // ============================================
  // API Key 管理端点
  // ============================================

  /**
   * 获取 API Key 状态
   */
  @Get(':managerId/api-key')
  @ApiOperation({ summary: '获取经理账号的 API Key 状态' })
  @ApiParam({ name: 'managerId', description: '经理账号 UUID' })
  @ApiResponse({
    status: 200,
    description: 'API Key 状态',
    type: ApiKeyStatusResponseDto,
  })
  @ApiResponse({ status: 404, description: '经理账号不存在' })
  async getApiKeyStatus(
    @CurrentUser('tenantId') tenantId: string,
    @Param('managerId') managerId: string,
  ): Promise<ApiKeyStatusResponseDto> {
    return this.apiKeyService.getApiKeyStatus(tenantId, managerId);
  }

  /**
   * 获取 API Secret
   * 需要 owner 或 admin 角色权限
   * 返回解密后的 API Secret，用于管理界面显示
   */
  @Get(':managerId/api-key/secret')
  @Roles('owner', 'admin')
  @ApiOperation({
    summary: '获取经理账号的 API Secret',
    description: '返回解密后的 API Secret，用于管理界面显示。需要 owner 或 admin 权限。',
  })
  @ApiParam({ name: 'managerId', description: '经理账号 UUID' })
  @ApiResponse({
    status: 200,
    description: 'API Key 和 Secret',
    type: GetApiSecretResponseDto,
  })
  @ApiResponse({ status: 400, description: '该账号没有 API Key' })
  @ApiResponse({ status: 404, description: '经理账号不存在' })
  async getApiSecret(
    @CurrentUser('tenantId') tenantId: string,
    @Param('managerId') managerId: string,
  ): Promise<GetApiSecretResponseDto> {
    return this.apiKeyService.getApiSecret(tenantId, managerId);
  }

  /**
   * 生成 API Key
   * 需要 owner 或 admin 角色权限
   * 注意: API Secret 仅在此次响应中返回，请妥善保存
   */
  @Post(':managerId/api-key')
  @Roles('owner', 'admin')
  @ApiOperation({
    summary: '为经理账号生成 API Key',
    description: 'API Secret 仅在创建时返回一次，请立即保存。如需更换，需先撤销现有 Key。可指定权限作用域。',
  })
  @ApiParam({ name: 'managerId', description: '经理账号 UUID' })
  @ApiResponse({
    status: 201,
    description: 'API Key 生成成功',
    type: GenerateApiKeyResponseDto,
  })
  @ApiResponse({ status: 404, description: '经理账号不存在' })
  @ApiResponse({ status: 409, description: '该账号已有 API Key，请先撤销' })
  async generateApiKey(
    @CurrentUser() user: JwtPayload,
    @Param('managerId') managerId: string,
    @Body() dto: GenerateApiKeyRequestDto,
  ): Promise<GenerateApiKeyResponseDto> {
    return this.apiKeyService.generateApiKey(
      user.tenantId,
      managerId,
      dto.scopes || ['*'],
      user.sub,
    );
  }

  /**
   * 撤销 API Key
   * 需要 owner 或 admin 角色权限
   */
  @Delete(':managerId/api-key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '撤销经理账号的 API Key' })
  @ApiParam({ name: 'managerId', description: '经理账号 UUID' })
  @ApiResponse({ status: 204, description: 'API Key 已撤销' })
  @ApiResponse({ status: 400, description: '该账号没有 API Key' })
  @ApiResponse({ status: 404, description: '经理账号不存在' })
  async revokeApiKey(
    @CurrentUser() user: JwtPayload,
    @Param('managerId') managerId: string,
  ): Promise<void> {
    return this.apiKeyService.revokeApiKey(user.tenantId, managerId, user.sub);
  }

  /**
   * 启用/禁用 API Key
   * 需要 owner 或 admin 角色权限
   */
  @Post(':managerId/api-key/toggle')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '启用或禁用经理账号的 API Key' })
  @ApiParam({ name: 'managerId', description: '经理账号 UUID' })
  @ApiResponse({ status: 200, description: '状态切换成功' })
  @ApiResponse({ status: 400, description: '该账号没有 API Key' })
  @ApiResponse({ status: 404, description: '经理账号不存在' })
  async toggleApiKey(
    @CurrentUser() user: JwtPayload,
    @Param('managerId') managerId: string,
    @Body() dto: ToggleApiKeyDto,
  ): Promise<void> {
    return this.apiKeyService.toggleApiKey(
      user.tenantId,
      managerId,
      dto.enabled,
      user.sub,
    );
  }

  /**
   * 更新 API Key IP 白名单
   * 需要 owner 或 admin 角色权限
   */
  @Put(':managerId/api-key/allowed-ips')
  @Roles('owner', 'admin')
  @ApiOperation({
    summary: '更新经理账号 API Key 的 IP 白名单',
    description: '设置允许使用 API Key 的 IP 地址列表。支持 CIDR 格式 (如 192.168.1.0/24)。空数组表示不限制 IP。',
  })
  @ApiParam({ name: 'managerId', description: '经理账号 UUID' })
  @ApiResponse({ status: 200, description: 'IP 白名单更新成功' })
  @ApiResponse({ status: 400, description: '该账号没有 API Key' })
  @ApiResponse({ status: 404, description: '经理账号不存在' })
  async updateAllowedIps(
    @CurrentUser() user: JwtPayload,
    @Param('managerId') managerId: string,
    @Body() dto: UpdateApiKeyAllowedIpsDto,
  ): Promise<void> {
    return this.apiKeyService.updateAllowedIps(
      user.tenantId,
      managerId,
      dto.allowedIps,
      user.sub,
    );
  }

  /**
   * 更新 API Key 作用域
   * 需要 owner 或 admin 角色权限
   */
  @Put(':managerId/api-key/scopes')
  @Roles('owner', 'admin')
  @ApiOperation({
    summary: '更新经理账号 API Key 的权限作用域',
    description: '设置 API Key 可访问的资源范围。使用 ["*"] 表示所有权限。',
  })
  @ApiParam({ name: 'managerId', description: '经理账号 UUID' })
  @ApiResponse({ status: 200, description: '作用域更新成功' })
  @ApiResponse({ status: 400, description: '该账号没有 API Key 或作用域格式无效' })
  @ApiResponse({ status: 404, description: '经理账号不存在' })
  async updateScopes(
    @CurrentUser() user: JwtPayload,
    @Param('managerId') managerId: string,
    @Body() dto: UpdateApiKeyScopesDto,
  ): Promise<void> {
    return this.apiKeyService.updateScopes(
      user.tenantId,
      managerId,
      dto.scopes,
      user.sub,
    );
  }

}
