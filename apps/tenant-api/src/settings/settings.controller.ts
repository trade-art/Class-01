import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SettingsService } from './settings.service';
import {
  BrandingDto,
  UpdateBrandingDto,
  AdminListResponseDto,
  AdminListItemDto,
  CreateAdminDto,
  UpdateAdminDto,
  ResetPasswordDto,
  UpdateStatusDto,
  ApiKeyListResponseDto,
  ApiKeyListItemDto,
  CreateApiKeyDto,
  CreateApiKeyResponseDto,
  UpdateApiKeyPermissionsDto,
  NotificationSettingsDto,
  UpdateNotificationSettingsDto,
  MT5ServerInfoDto,
} from './dto';

@ApiTags('设置')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // ============================================
  // Branding (白标配置)
  // ============================================

  @Get('branding')
  @Roles('owner', 'admin', 'operator')
  @ApiOperation({ summary: '获取白标配置' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取白标配置',
    type: BrandingDto,
  })
  async getBranding(@CurrentUser() user: JwtPayload): Promise<BrandingDto> {
    return this.settingsService.getBranding(user.tenantId);
  }

  @Put('branding')
  @Roles('owner')
  @ApiOperation({ summary: '更新白标配置' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功更新白标配置',
    type: BrandingDto,
  })
  async updateBranding(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateBrandingDto,
  ): Promise<BrandingDto> {
    return this.settingsService.updateBranding(user.tenantId, dto);
  }

  // ============================================
  // Admins (管理员管理)
  // ============================================

  @Get('admins')
  @Roles('owner')
  @ApiOperation({ summary: '获取管理员列表' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取管理员列表',
    type: AdminListResponseDto,
  })
  async getAdmins(
    @CurrentUser() user: JwtPayload,
  ): Promise<AdminListResponseDto> {
    return this.settingsService.getAdmins(user.tenantId);
  }

  @Post('admins')
  @Roles('owner')
  @ApiOperation({ summary: '创建管理员' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: '成功创建管理员',
    type: AdminListItemDto,
  })
  async createAdmin(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAdminDto,
  ): Promise<AdminListItemDto> {
    return this.settingsService.createAdmin(user.tenantId, dto);
  }

  @Put('admins/:id')
  @Roles('owner')
  @ApiOperation({ summary: '更新管理员' })
  @ApiParam({ name: 'id', description: '管理员 ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功更新管理员',
    type: AdminListItemDto,
  })
  async updateAdmin(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAdminDto,
  ): Promise<AdminListItemDto> {
    return this.settingsService.updateAdmin(user.tenantId, id, user.sub, dto);
  }

  @Post('admins/:id/reset-password')
  @Roles('owner')
  @ApiOperation({ summary: '重置管理员密码' })
  @ApiParam({ name: 'id', description: '管理员 ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功重置密码',
  })
  async resetPassword(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<void> {
    return this.settingsService.resetAdminPassword(
      user.tenantId,
      id,
      dto.newPassword,
    );
  }

  @Put('admins/:id/status')
  @Roles('owner')
  @ApiOperation({ summary: '切换管理员状态' })
  @ApiParam({ name: 'id', description: '管理员 ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功切换状态',
    type: AdminListItemDto,
  })
  async toggleAdminStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ): Promise<AdminListItemDto> {
    return this.settingsService.toggleAdminStatus(
      user.tenantId,
      id,
      user.sub,
      dto.isActive,
    );
  }

  @Delete('admins/:id')
  @Roles('owner')
  @ApiOperation({ summary: '删除管理员' })
  @ApiParam({ name: 'id', description: '管理员 ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功删除管理员',
  })
  async deleteAdmin(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<void> {
    return this.settingsService.deleteAdmin(user.tenantId, id, user.sub);
  }

  // ============================================
  // API Keys (API 密钥管理)
  // ============================================

  @Get('api-keys')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '获取 API 密钥列表' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取 API 密钥列表',
    type: ApiKeyListResponseDto,
  })
  async getApiKeys(
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiKeyListResponseDto> {
    return this.settingsService.getApiKeys(user.tenantId);
  }

  @Post('api-keys')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '创建 API 密钥' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: '成功创建 API 密钥',
    type: CreateApiKeyResponseDto,
  })
  async createApiKey(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateApiKeyDto,
  ): Promise<CreateApiKeyResponseDto> {
    return this.settingsService.createApiKey(user.tenantId, dto);
  }

  @Put('api-keys/:id/permissions')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '更新 API 密钥权限' })
  @ApiParam({ name: 'id', description: 'API 密钥 ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功更新权限',
    type: ApiKeyListItemDto,
  })
  async updateApiKeyPermissions(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateApiKeyPermissionsDto,
  ): Promise<ApiKeyListItemDto> {
    return this.settingsService.updateApiKeyPermissions(user.tenantId, id, dto);
  }

  @Post('api-keys/:id/regenerate')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '重新生成 API 密钥' })
  @ApiParam({ name: 'id', description: 'API 密钥 ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功重新生成密钥',
    type: CreateApiKeyResponseDto,
  })
  async regenerateApiKey(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<CreateApiKeyResponseDto> {
    return this.settingsService.regenerateApiKey(user.tenantId, id);
  }

  @Put('api-keys/:id/status')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '切换 API 密钥状态' })
  @ApiParam({ name: 'id', description: 'API 密钥 ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功切换状态',
    type: ApiKeyListItemDto,
  })
  async toggleApiKeyStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ): Promise<ApiKeyListItemDto> {
    return this.settingsService.toggleApiKeyStatus(
      user.tenantId,
      id,
      dto.isActive,
    );
  }

  @Delete('api-keys/:id')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '删除 API 密钥' })
  @ApiParam({ name: 'id', description: 'API 密钥 ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功删除 API 密钥',
  })
  async deleteApiKey(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<void> {
    return this.settingsService.deleteApiKey(user.tenantId, id);
  }

  // ============================================
  // Notifications (通知设置)
  // ============================================

  @Get('notifications')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '获取通知设置' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取通知设置',
    type: NotificationSettingsDto,
  })
  async getNotificationSettings(
    @CurrentUser() user: JwtPayload,
  ): Promise<NotificationSettingsDto> {
    return this.settingsService.getNotificationSettings(user.tenantId);
  }

  @Put('notifications')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '更新通知设置' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功更新通知设置',
    type: NotificationSettingsDto,
  })
  async updateNotificationSettings(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettingsDto> {
    return this.settingsService.updateNotificationSettings(user.tenantId, dto);
  }

  // ============================================
  // MT5 Server Info
  // ============================================

  @Get('mt5-server')
  @Roles('owner', 'admin', 'operator')
  @ApiOperation({ summary: '获取 MT5 服务器信息' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取 MT5 服务器信息',
    type: MT5ServerInfoDto,
  })
  async getMT5ServerInfo(
    @CurrentUser() user: JwtPayload,
  ): Promise<MT5ServerInfoDto> {
    return this.settingsService.getMT5ServerInfo(user.instanceId);
  }
}
