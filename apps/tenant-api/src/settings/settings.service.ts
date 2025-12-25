import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MiddlewareProxyService } from '../middleware-proxy';
import { TenantRole, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  BrandingDto,
  UpdateBrandingDto,
  AdminListItemDto,
  AdminListResponseDto,
  CreateAdminDto,
  UpdateAdminDto,
  AdminRole,
  ApiKeyListItemDto,
  ApiKeyListResponseDto,
  CreateApiKeyDto,
  CreateApiKeyResponseDto,
  UpdateApiKeyPermissionsDto,
  NotificationSettingsDto,
  UpdateNotificationSettingsDto,
  MT5ServerInfoDto,
  SubscriptionStatusDto,
  SubscriptionPlan,
  ResourceUsageDto,
} from './dto';

/**
 * 设置服务
 * 提供白标、管理员、API密钥、通知设置和MT5服务器信息管理
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly middlewareProxy: MiddlewareProxyService,
  ) {}

  // ============================================
  // Branding (白标配置)
  // ============================================

  /**
   * 获取白标配置
   */
  async getBranding(tenantId: string): Promise<BrandingDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        displayName: true,
        logo: true,
        primaryColor: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('租户不存在');
    }

    return {
      displayName: tenant.displayName ?? undefined,
      logo: tenant.logo ?? undefined,
      primaryColor: tenant.primaryColor ?? undefined,
    };
  }

  /**
   * 更新白标配置
   */
  async updateBranding(
    tenantId: string,
    dto: UpdateBrandingDto,
  ): Promise<BrandingDto> {
    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        displayName: dto.displayName,
        primaryColor: dto.primaryColor,
      },
      select: {
        displayName: true,
        logo: true,
        primaryColor: true,
      },
    });

    this.logger.log(`更新租户 ${tenantId} 白标配置`);

    return {
      displayName: tenant.displayName ?? undefined,
      logo: tenant.logo ?? undefined,
      primaryColor: tenant.primaryColor ?? undefined,
    };
  }

  // ============================================
  // Admins (管理员管理)
  // ============================================

  /**
   * 获取管理员列表
   */
  async getAdmins(tenantId: string): Promise<AdminListResponseDto> {
    const admins = await this.prisma.tenantAdmin.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      admins: admins.map((admin) => this.mapToAdminDto(admin)),
      total: admins.length,
    };
  }

  /**
   * 创建管理员
   */
  async createAdmin(
    tenantId: string,
    dto: CreateAdminDto,
  ): Promise<AdminListItemDto> {
    // 检查邮箱是否已存在
    const existing = await this.prisma.tenantAdmin.findFirst({
      where: { tenantId, email: dto.email },
    });

    if (existing) {
      throw new ConflictException('邮箱已被使用');
    }

    // 哈希密码
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // 将 DTO 角色映射到 Prisma TenantRole
    const prismaRole = this.mapDtoRoleToPrisma(dto.role);

    const admin = await this.prisma.tenantAdmin.create({
      data: {
        tenantId,
        email: dto.email,
        name: dto.name,
        password: passwordHash,
        role: prismaRole,
        isActive: true,
      },
    });

    this.logger.log(`创建管理员 ${dto.email} (租户: ${tenantId})`);

    return this.mapToAdminDto(admin);
  }

  /**
   * 更新管理员
   */
  async updateAdmin(
    tenantId: string,
    adminId: string,
    currentAdminId: string,
    dto: UpdateAdminDto,
  ): Promise<AdminListItemDto> {
    const admin = await this.prisma.tenantAdmin.findFirst({
      where: { id: adminId, tenantId },
    });

    if (!admin) {
      throw new NotFoundException('管理员不存在');
    }

    // 不能降级自己的角色
    if (adminId === currentAdminId && dto.role) {
      const newPrismaRole = this.mapDtoRoleToPrisma(dto.role);
      if (newPrismaRole !== admin.role) {
        throw new ForbiddenException('不能修改自己的角色');
      }
    }

    const updateData: Prisma.TenantAdminUpdateInput = {
      name: dto.name,
    };

    if (dto.role) {
      updateData.role = this.mapDtoRoleToPrisma(dto.role);
    }

    const updated = await this.prisma.tenantAdmin.update({
      where: { id: adminId },
      data: updateData,
    });

    this.logger.log(`更新管理员 ${adminId}`);

    return this.mapToAdminDto(updated);
  }

  /**
   * 重置管理员密码
   */
  async resetAdminPassword(
    tenantId: string,
    adminId: string,
    newPassword: string,
  ): Promise<void> {
    const admin = await this.prisma.tenantAdmin.findFirst({
      where: { id: adminId, tenantId },
    });

    if (!admin) {
      throw new NotFoundException('管理员不存在');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.tenantAdmin.update({
      where: { id: adminId },
      data: { password: passwordHash },
    });

    this.logger.log(`重置管理员 ${adminId} 密码`);
  }

  /**
   * 切换管理员状态
   */
  async toggleAdminStatus(
    tenantId: string,
    adminId: string,
    currentAdminId: string,
    isActive: boolean,
  ): Promise<AdminListItemDto> {
    const admin = await this.prisma.tenantAdmin.findFirst({
      where: { id: adminId, tenantId },
    });

    if (!admin) {
      throw new NotFoundException('管理员不存在');
    }

    // 不能禁用自己
    if (adminId === currentAdminId) {
      throw new ForbiddenException('不能禁用自己的账号');
    }

    // 检查是否是最后一个 Owner
    if (!isActive && admin.role === TenantRole.OWNER) {
      const ownerCount = await this.prisma.tenantAdmin.count({
        where: { tenantId, role: TenantRole.OWNER, isActive: true },
      });

      if (ownerCount <= 1) {
        throw new ForbiddenException('不能禁用最后一个 Owner');
      }
    }

    const updated = await this.prisma.tenantAdmin.update({
      where: { id: adminId },
      data: { isActive },
    });

    this.logger.log(`${isActive ? '启用' : '禁用'}管理员 ${adminId}`);

    return this.mapToAdminDto(updated);
  }

  /**
   * 删除管理员
   */
  async deleteAdmin(
    tenantId: string,
    adminId: string,
    currentAdminId: string,
  ): Promise<void> {
    const admin = await this.prisma.tenantAdmin.findFirst({
      where: { id: adminId, tenantId },
    });

    if (!admin) {
      throw new NotFoundException('管理员不存在');
    }

    // 不能删除自己
    if (adminId === currentAdminId) {
      throw new ForbiddenException('不能删除自己的账号');
    }

    // 检查是否是最后一个 Owner
    if (admin.role === TenantRole.OWNER) {
      const ownerCount = await this.prisma.tenantAdmin.count({
        where: { tenantId, role: TenantRole.OWNER },
      });

      if (ownerCount <= 1) {
        throw new ForbiddenException('不能删除最后一个 Owner');
      }
    }

    await this.prisma.tenantAdmin.delete({
      where: { id: adminId },
    });

    this.logger.log(`删除管理员 ${adminId}`);
  }

  // ============================================
  // API Keys (API 密钥管理)
  // ============================================

  /**
   * 获取 API 密钥列表
   */
  async getApiKeys(tenantId: string): Promise<ApiKeyListResponseDto> {
    const apiKeys = await this.prisma.apiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      apiKeys: apiKeys.map((key) => this.mapToApiKeyDto(key)),
      total: apiKeys.length,
    };
  }

  /**
   * 创建 API 密钥
   */
  async createApiKey(
    tenantId: string,
    dto: CreateApiKeyDto,
  ): Promise<CreateApiKeyResponseDto> {
    // 生成密钥
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.prisma.apiKey.create({
      data: {
        tenantId,
        name: dto.name,
        keyPrefix: rawKey.substring(0, 8), // 存储前缀用于显示
        hashedKey: keyHash,
        scopes: dto.permissions, // permissions 映射到 scopes
        isActive: true,
      },
    });

    this.logger.log(`创建 API 密钥 ${dto.name} (租户: ${tenantId})`);

    return {
      id: apiKey.id,
      name: apiKey.name,
      apiKey: rawKey, // 仅在创建时返回完整密钥
      permissions: dto.permissions,
      createdAt: apiKey.createdAt.toISOString(),
    };
  }

  /**
   * 更新 API 密钥权限
   */
  async updateApiKeyPermissions(
    tenantId: string,
    keyId: string,
    dto: UpdateApiKeyPermissionsDto,
  ): Promise<ApiKeyListItemDto> {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { id: keyId, tenantId },
    });

    if (!apiKey) {
      throw new NotFoundException('API 密钥不存在');
    }

    const updated = await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { scopes: dto.permissions }, // permissions 映射到 scopes
    });

    this.logger.log(`更新 API 密钥 ${keyId} 权限`);

    return this.mapToApiKeyDto(updated);
  }

  /**
   * 重新生成 API 密钥
   */
  async regenerateApiKey(
    tenantId: string,
    keyId: string,
  ): Promise<CreateApiKeyResponseDto> {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { id: keyId, tenantId },
    });

    if (!apiKey) {
      throw new NotFoundException('API 密钥不存在');
    }

    // 生成新密钥
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const updated = await this.prisma.apiKey.update({
      where: { id: keyId },
      data: {
        keyPrefix: rawKey.substring(0, 8),
        hashedKey: keyHash,
      },
    });

    this.logger.log(`重新生成 API 密钥 ${keyId}`);

    const permissions = this.parseScopesToPermissions(updated.scopes);

    return {
      id: updated.id,
      name: updated.name,
      apiKey: rawKey,
      permissions,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  /**
   * 切换 API 密钥状态
   */
  async toggleApiKeyStatus(
    tenantId: string,
    keyId: string,
    isActive: boolean,
  ): Promise<ApiKeyListItemDto> {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { id: keyId, tenantId },
    });

    if (!apiKey) {
      throw new NotFoundException('API 密钥不存在');
    }

    const updated = await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive },
    });

    this.logger.log(`${isActive ? '启用' : '禁用'} API 密钥 ${keyId}`);

    return this.mapToApiKeyDto(updated);
  }

  /**
   * 删除 API 密钥
   */
  async deleteApiKey(tenantId: string, keyId: string): Promise<void> {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { id: keyId, tenantId },
    });

    if (!apiKey) {
      throw new NotFoundException('API 密钥不存在');
    }

    await this.prisma.apiKey.delete({
      where: { id: keyId },
    });

    this.logger.log(`删除 API 密钥 ${keyId}`);
  }

  // ============================================
  // Notifications (通知设置)
  // ============================================

  /**
   * 获取通知设置
   */
  async getNotificationSettings(
    tenantId: string,
  ): Promise<NotificationSettingsDto> {
    let settings = await this.prisma.notificationSetting.findUnique({
      where: { tenantId },
    });

    // 如果没有设置，创建默认设置
    if (!settings) {
      settings = await this.prisma.notificationSetting.create({
        data: {
          tenantId,
          riskAlertEmail: true,
          systemAlertEmail: true,
          webhookEnabled: false,
        },
      });
    }

    return {
      riskAlertEmail: settings.riskAlertEmail,
      systemAlertEmail: settings.systemAlertEmail,
      webhookUrl: settings.webhookUrl ?? undefined,
      webhookEnabled: settings.webhookEnabled,
    };
  }

  /**
   * 更新通知设置
   */
  async updateNotificationSettings(
    tenantId: string,
    dto: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettingsDto> {
    const settings = await this.prisma.notificationSetting.upsert({
      where: { tenantId },
      update: {
        riskAlertEmail: dto.riskAlertEmail,
        systemAlertEmail: dto.systemAlertEmail,
        webhookUrl: dto.webhookUrl,
        webhookEnabled: dto.webhookEnabled,
      },
      create: {
        tenantId,
        riskAlertEmail: dto.riskAlertEmail ?? true,
        systemAlertEmail: dto.systemAlertEmail ?? true,
        webhookUrl: dto.webhookUrl,
        webhookEnabled: dto.webhookEnabled ?? false,
      },
    });

    this.logger.log(`更新租户 ${tenantId} 通知设置`);

    return {
      riskAlertEmail: settings.riskAlertEmail,
      systemAlertEmail: settings.systemAlertEmail,
      webhookUrl: settings.webhookUrl ?? undefined,
      webhookEnabled: settings.webhookEnabled,
    };
  }

  // ============================================
  // MT5 Server Info
  // ============================================

  /**
   * 获取 MT5 服务器信息
   */
  async getMT5ServerInfo(instanceId: string): Promise<MT5ServerInfoDto> {
    try {
      const health = await this.middlewareProxy.request<{
        serverName?: string;
        connected: boolean;
        lastHeartbeat?: string;
        latency?: number;
        version?: string;
      }>('get', '/health/detailed', instanceId);

      return {
        serverName: health.serverName ?? 'MT5 Server',
        connected: health.connected,
        lastHeartbeat: health.lastHeartbeat,
        latency: health.latency,
        version: health.version ?? '1.0.0',
      };
    } catch (error) {
      this.logger.warn('获取 MT5 服务器信息失败', error);

      return {
        serverName: 'MT5 Server',
        connected: false,
        version: 'Unknown',
      };
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * 将 Prisma TenantRole 映射到 DTO AdminRole
   */
  private mapPrismaRoleToDto(role: TenantRole): AdminRole {
    switch (role) {
      case TenantRole.OWNER:
        return AdminRole.OWNER;
      case TenantRole.ADMIN:
        return AdminRole.ADMIN;
      case TenantRole.OPERATOR:
        return AdminRole.OPERATOR;
      default:
        return AdminRole.OPERATOR;
    }
  }

  /**
   * 将 DTO AdminRole 映射到 Prisma TenantRole
   */
  private mapDtoRoleToPrisma(role: AdminRole): TenantRole {
    switch (role) {
      case AdminRole.OWNER:
        return TenantRole.OWNER;
      case AdminRole.ADMIN:
        return TenantRole.ADMIN;
      case AdminRole.OPERATOR:
        return TenantRole.OPERATOR;
      default:
        return TenantRole.OPERATOR;
    }
  }

  /**
   * 解析权限 JSON (兼容旧版本)
   */
  private parsePermissions(permissions: Prisma.JsonValue): string[] {
    if (Array.isArray(permissions)) {
      return permissions.map((p) => String(p));
    }
    return [];
  }

  /**
   * 解析 scopes 到 permissions (新版本字段映射)
   */
  private parseScopesToPermissions(scopes: string[]): string[] {
    return scopes || [];
  }

  private mapToAdminDto(admin: {
    id: string;
    email: string;
    name: string;
    role: TenantRole;
    isActive: boolean;
    lastLogin: Date | null;
    createdAt: Date;
  }): AdminListItemDto {
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: this.mapPrismaRoleToDto(admin.role),
      isActive: admin.isActive,
      lastLogin: admin.lastLogin?.toISOString(),
      createdAt: admin.createdAt.toISOString(),
    };
  }

  private mapToApiKeyDto(apiKey: {
    id: string;
    name: string;
    keyPrefix: string;
    scopes: string[];
    isActive: boolean;
    lastUsedAt: Date | null;
    createdAt: Date;
  }): ApiKeyListItemDto {
    return {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: `${apiKey.keyPrefix}****`,
      permissions: apiKey.scopes || [],
      isActive: apiKey.isActive,
      lastUsedAt: apiKey.lastUsedAt?.toISOString(),
      createdAt: apiKey.createdAt.toISOString(),
    };
  }

  // ============================================
  // Subscription & Quota (订阅与配额)
  // ============================================

  /**
   * 获取订阅状态与配额使用情况
   */
  async getSubscriptionStatus(tenantId: string): Promise<SubscriptionStatusDto> {
    // 获取租户信息（包含配额限制）
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        plan: true,
        status: true,
        expiresAt: true,
        maxInstances: true,
        maxAdmins: true,
        maxMtServers: true,
        maxManagerAccounts: true,
        supportedPlatforms: true,
        _count: {
          select: {
            admins: true,
            mtServers: true,
            instances: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('租户不存在');
    }

    // 计算剩余天数
    let daysRemaining = -1; // -1 表示永不过期
    let isExpiringSoon = false;

    if (tenant.expiresAt) {
      const now = new Date();
      const expiresAt = new Date(tenant.expiresAt);
      const diffTime = expiresAt.getTime() - now.getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      isExpiringSoon = daysRemaining > 0 && daysRemaining <= 30;
    }

    // 构建资源使用情况
    const buildResourceUsage = (used: number, max: number): ResourceUsageDto => ({
      used,
      max,
      percentage: max > 0 ? Math.round((used / max) * 100) : 0,
    });

    return {
      plan: tenant.plan as SubscriptionPlan,
      status: tenant.status,
      expiresAt: tenant.expiresAt?.toISOString(),
      isExpiringSoon,
      daysRemaining,
      supportedPlatforms: tenant.supportedPlatforms || ['MT5'],
      admins: buildResourceUsage(tenant._count.admins, tenant.maxAdmins),
      mtServers: buildResourceUsage(tenant._count.mtServers, tenant.maxMtServers),
      // MT经理账号数量 = 已配置的 MT 服务器数量（每个服务器有一个经理账号）
      managerAccounts: buildResourceUsage(tenant._count.mtServers, tenant.maxManagerAccounts),
      instances: buildResourceUsage(tenant._count.instances, tenant.maxInstances),
    };
  }

  /**
   * 检查是否可以添加管理员
   */
  async canAddAdmin(tenantId: string): Promise<{ canAdd: boolean; message?: string }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        maxAdmins: true,
        _count: {
          select: { admins: true },
        },
      },
    });

    if (!tenant) {
      return { canAdd: false, message: '租户不存在' };
    }

    if (tenant._count.admins >= tenant.maxAdmins) {
      return {
        canAdd: false,
        message: `已达到管理员数量上限 (${tenant.maxAdmins})，请升级订阅计划或联系平台管理员`,
      };
    }

    return { canAdd: true };
  }

  /**
   * 检查是否可以添加 MT 服务器
   */
  async canAddMtServer(tenantId: string): Promise<{ canAdd: boolean; message?: string }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        maxMtServers: true,
        _count: {
          select: { mtServers: true },
        },
      },
    });

    if (!tenant) {
      return { canAdd: false, message: '租户不存在' };
    }

    if (tenant._count.mtServers >= tenant.maxMtServers) {
      return {
        canAdd: false,
        message: `已达到 MT 服务器数量上限 (${tenant.maxMtServers})，请升级订阅计划或联系平台管理员`,
      };
    }

    return { canAdd: true };
  }
}
