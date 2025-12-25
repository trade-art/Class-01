import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformType as PrismaPlatformType, Prisma } from '@prisma/client';
import { MtServerConfig, PlatformType } from '../adapters/types';
import { AdapterFactory } from '../adapters/adapter.factory';
import { MiddlewareAuthService } from './middleware-auth.service';
import * as crypto from 'crypto';

/**
 * 连接测试结果
 */
export interface ConnectionTestResult {
  success: boolean;
  latency?: number;
  serverVersion?: string;
  serverTime?: string;
  error?: string;
}

/**
 * MT 服务器配额信息
 */
export interface MtServerQuotaDto {
  maxServers: number;
  currentServers: number;
  availableSlots: number;
  supportedPlatforms: string[];
  canAddServer: boolean;
}

/**
 * MT 服务器列表项 DTO
 * 注意：经理账号信息现在通过 MtManager API 获取
 */
export interface MtServerDto {
  id: string;
  serverId: string;
  displayName: string | null;
  platformType: PlatformType;
  middlewareId: string | null;
  middlewareUrl: string;
  serverAddress: string;
  managerCount: number;
  /** 默认经理账号登录名，如果有的话 */
  defaultManagerLogin: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 创建 MT 服务器 DTO
 * 注意：经理账号现在在单独的 MtManager 模块中管理
 */
export interface CreateMtServerDto {
  serverId: string;
  displayName?: string;
  platformType?: PlatformType;
  middlewareId: string;
  middlewareUrl: string;
  serverAddress: string;
  isDefault?: boolean;
}

/**
 * 更新 MT 服务器 DTO
 */
export interface UpdateMtServerDto {
  displayName?: string;
  middlewareId?: string;
  middlewareUrl?: string;
  serverAddress?: string;
  isDefault?: boolean;
}

/**
 * MT 服务器列表响应 DTO
 */
export interface MtServerListResponseDto {
  servers: MtServerDto[];
  total: number;
}

/**
 * MT 服务器服务
 * 管理租户的 MT 服务器配置
 * 注意：经理账号现在由 MtManagerService 管理
 */
@Injectable()
export class MtServerService {
  private readonly logger = new Logger(MtServerService.name);

  /**
   * 密码加密密钥 (生产环境应从配置中读取)
   */
  private readonly encryptionKey: string;
  private readonly encryptionAlgorithm = 'aes-256-gcm';

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapterFactory: AdapterFactory,
    @Inject(forwardRef(() => MiddlewareAuthService))
    private readonly middlewareAuthService: MiddlewareAuthService,
  ) {
    // 从环境变量获取加密密钥，或使用默认值（仅开发环境）
    this.encryptionKey =
      process.env.MT_SERVER_ENCRYPTION_KEY ||
      'mt5platform2024encryptionkey1234';
  }

  // ============================================================
  // 查询方法
  // ============================================================

  /**
   * 获取租户的所有 MT 服务器
   */
  async getServers(tenantId: string): Promise<MtServerListResponseDto> {
    const servers = await this.prisma.mtServer.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: { managers: true },
        },
        // 获取默认经理账号（如果没有默认的，获取第一个活跃的）
        managers: {
          where: { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          take: 1,
          select: { managerLogin: true },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      servers: servers.map((server) => this.mapToDto(server)),
      total: servers.length,
    };
  }

  /**
   * 获取租户的活跃 MT 服务器
   */
  async getActiveServers(tenantId: string): Promise<MtServerDto[]> {
    const servers = await this.prisma.mtServer.findMany({
      where: { tenantId, isActive: true },
      include: {
        _count: {
          select: { managers: true },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return servers.map((server) => this.mapToDto(server));
  }

  /**
   * 获取单个 MT 服务器
   */
  async getServer(tenantId: string, serverId: string): Promise<MtServerDto> {
    const server = await this.prisma.mtServer.findFirst({
      where: { tenantId, serverId },
      include: {
        _count: {
          select: { managers: true },
        },
      },
    });

    if (!server) {
      throw new NotFoundException(`MT 服务器 ${serverId} 不存在`);
    }

    return this.mapToDto(server);
  }

  /**
   * 获取租户的 MT 服务器配额信息
   */
  async getQuota(tenantId: string): Promise<MtServerQuotaDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        maxMtServers: true,
        supportedPlatforms: true,
        _count: { select: { mtServers: true } },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`租户不存在`);
    }

    const currentServers = tenant._count.mtServers;
    const maxServers = tenant.maxMtServers;

    return {
      maxServers,
      currentServers,
      availableSlots: Math.max(0, maxServers - currentServers),
      supportedPlatforms: tenant.supportedPlatforms,
      canAddServer: currentServers < maxServers,
    };
  }

  /**
   * 获取租户的默认 MT 服务器
   */
  async getDefaultServer(tenantId: string): Promise<MtServerDto | null> {
    const server = await this.prisma.mtServer.findFirst({
      where: { tenantId, isDefault: true, isActive: true },
      include: {
        _count: {
          select: { managers: true },
        },
      },
    });

    if (!server) {
      // 如果没有默认服务器，返回第一个活跃服务器
      const firstActive = await this.prisma.mtServer.findFirst({
        where: { tenantId, isActive: true },
        include: {
          _count: {
            select: { managers: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      return firstActive ? this.mapToDto(firstActive) : null;
    }

    return this.mapToDto(server);
  }

  /**
   * 获取服务器配置（用于创建适配器）
   * 现在需要从 MtManager 表获取经理账号信息
   */
  async getServerConfig(
    tenantId: string,
    serverId: string,
  ): Promise<MtServerConfig> {
    const server = await this.prisma.mtServer.findFirst({
      where: { tenantId, serverId, isActive: true },
    });

    if (!server) {
      throw new NotFoundException(`MT 服务器 ${serverId} 不存在或未激活`);
    }

    // 获取默认经理账号
    let manager = await this.prisma.mtManager.findFirst({
      where: { mtServerId: server.id, isDefault: true, isActive: true },
    });

    if (!manager) {
      // 如果没有默认账号，获取第一个活跃账号
      manager = await this.prisma.mtManager.findFirst({
        where: { mtServerId: server.id, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!manager) {
      throw new NotFoundException(
        `MT 服务器 ${serverId} 没有可用的经理账号，请先添加经理账号`,
      );
    }

    return {
      tenantId: server.tenantId,
      serverId: server.serverId,
      platformType: this.mapPrismaPlatformType(server.platformType),
      middlewareUrl: server.middlewareUrl,
      serverAddress: server.serverAddress,
      managerLogin: Number(manager.managerLogin),
      managerPassword: this.decryptPassword(manager.managerPasswordEncrypted),
      managerId: manager.id,
    };
  }

  /**
   * 获取租户默认服务器的配置
   */
  async getDefaultServerConfig(tenantId: string): Promise<MtServerConfig> {
    const defaultServer = await this.prisma.mtServer.findFirst({
      where: { tenantId, isDefault: true, isActive: true },
    });

    if (!defaultServer) {
      // 尝试获取第一个活跃服务器
      const firstActive = await this.prisma.mtServer.findFirst({
        where: { tenantId, isActive: true },
        orderBy: { createdAt: 'asc' },
      });

      if (!firstActive) {
        throw new NotFoundException(`租户 ${tenantId} 没有可用的 MT 服务器`);
      }

      return this.buildServerConfig(firstActive);
    }

    return this.buildServerConfig(defaultServer);
  }

  // ============================================================
  // 创建/更新/删除方法
  // ============================================================

  /**
   * 创建 MT 服务器
   * 包含配额验证
   * 注意：创建服务器后需要单独添加经理账号
   */
  async createServer(
    tenantId: string,
    dto: CreateMtServerDto,
  ): Promise<MtServerDto> {
    // 获取租户配额信息
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        maxMtServers: true,
        supportedPlatforms: true,
        _count: { select: { mtServers: true } },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`租户不存在`);
    }

    // 检查服务器数量配额
    if (tenant._count.mtServers >= tenant.maxMtServers) {
      throw new ForbiddenException(
        `已达到最大服务器数量限制 (${tenant.maxMtServers})，请联系管理员升级套餐`,
      );
    }

    // 检查平台类型是否支持
    const platformType = dto.platformType || PlatformType.MT5;
    if (!tenant.supportedPlatforms.includes(platformType)) {
      throw new ForbiddenException(
        `当前套餐不支持 ${platformType} 平台，支持的平台: ${tenant.supportedPlatforms.join(', ')}`,
      );
    }

    // 检查 serverId 是否已存在
    const existing = await this.prisma.mtServer.findFirst({
      where: { tenantId, serverId: dto.serverId },
    });

    if (existing) {
      throw new ConflictException(`服务器 ID ${dto.serverId} 已存在`);
    }

    // 验证中间件 URL 格式
    this.validateMiddlewareUrl(dto.middlewareUrl);

    // 如果设置为默认，取消其他默认服务器
    if (dto.isDefault) {
      await this.clearDefaultServer(tenantId);
    }

    const server = await this.prisma.mtServer.create({
      data: {
        tenantId,
        serverId: dto.serverId,
        displayName: dto.displayName,
        platformType: this.mapToPrismaPlatformType(platformType),
        middlewareId: dto.middlewareId,
        middlewareUrl: dto.middlewareUrl,
        serverAddress: dto.serverAddress,
        isActive: true,
        isDefault: dto.isDefault ?? false,
      },
      include: {
        _count: {
          select: { managers: true },
        },
      },
    });

    this.logger.log(
      `创建 MT 服务器: ${dto.serverId} (租户: ${tenantId}, 平台: ${platformType})`,
    );

    return this.mapToDto(server);
  }

  /**
   * 更新 MT 服务器
   */
  async updateServer(
    tenantId: string,
    serverId: string,
    dto: UpdateMtServerDto,
  ): Promise<MtServerDto> {
    const server = await this.prisma.mtServer.findFirst({
      where: { tenantId, serverId },
    });

    if (!server) {
      throw new NotFoundException(`MT 服务器 ${serverId} 不存在`);
    }

    // 验证中间件 URL 格式
    if (dto.middlewareUrl) {
      this.validateMiddlewareUrl(dto.middlewareUrl);
    }

    // 如果设置为默认，取消其他默认服务器
    if (dto.isDefault && !server.isDefault) {
      await this.clearDefaultServer(tenantId);
    }

    const updateData: Prisma.MtServerUpdateInput = {
      displayName: dto.displayName,
      middlewareUrl: dto.middlewareUrl,
      serverAddress: dto.serverAddress,
    };

    // 更新中间件关联（使用 Prisma 关系语法）
    if (dto.middlewareId !== undefined) {
      if (dto.middlewareId) {
        updateData.middleware = { connect: { id: dto.middlewareId } };
      } else {
        updateData.middleware = { disconnect: true };
      }
    }

    if (dto.isDefault !== undefined) {
      updateData.isDefault = dto.isDefault;
    }

    const updated = await this.prisma.mtServer.update({
      where: { id: server.id },
      data: updateData,
      include: {
        _count: {
          select: { managers: true },
        },
      },
    });

    // 如果中间件 URL 或默认状态变更，清除认证会话缓存
    if (dto.middlewareUrl || dto.isDefault !== undefined) {
      this.clearAuthSessionCache(tenantId, serverId);
    }

    this.logger.log(`更新 MT 服务器: ${serverId} (租户: ${tenantId})`);

    return this.mapToDto(updated);
  }

  /**
   * 切换 MT 服务器状态
   */
  async toggleServerStatus(
    tenantId: string,
    serverId: string,
    isActive: boolean,
  ): Promise<MtServerDto> {
    const server = await this.prisma.mtServer.findFirst({
      where: { tenantId, serverId },
    });

    if (!server) {
      throw new NotFoundException(`MT 服务器 ${serverId} 不存在`);
    }

    // 如果禁用默认服务器，需要选择新的默认服务器
    if (!isActive && server.isDefault) {
      const otherActive = await this.prisma.mtServer.findFirst({
        where: {
          tenantId,
          id: { not: server.id },
          isActive: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (otherActive) {
        await this.prisma.mtServer.update({
          where: { id: otherActive.id },
          data: { isDefault: true },
        });
      }
    }

    const updated = await this.prisma.mtServer.update({
      where: { id: server.id },
      data: {
        isActive,
        isDefault: isActive ? server.isDefault : false,
      },
      include: {
        _count: {
          select: { managers: true },
        },
      },
    });

    // 清除认证会话缓存，确保 Dashboard 状态准确
    this.clearAuthSessionCache(tenantId, serverId);

    this.logger.log(
      `${isActive ? '启用' : '禁用'} MT 服务器: ${serverId} (租户: ${tenantId})`,
    );

    return this.mapToDto(updated);
  }

  /**
   * 设置默认 MT 服务器
   */
  async setDefaultServer(
    tenantId: string,
    serverId: string,
  ): Promise<MtServerDto> {
    const server = await this.prisma.mtServer.findFirst({
      where: { tenantId, serverId, isActive: true },
    });

    if (!server) {
      throw new NotFoundException(`MT 服务器 ${serverId} 不存在或未激活`);
    }

    // 取消其他默认服务器
    await this.clearDefaultServer(tenantId);

    const updated = await this.prisma.mtServer.update({
      where: { id: server.id },
      data: { isDefault: true },
      include: {
        _count: {
          select: { managers: true },
        },
      },
    });

    // 清除认证会话缓存，确保 Dashboard 状态准确
    this.clearAuthSessionCache(tenantId, serverId);

    this.logger.log(`设置默认 MT 服务器: ${serverId} (租户: ${tenantId})`);

    return this.mapToDto(updated);
  }

  /**
   * 删除 MT 服务器
   * 注意：关联的经理账号会级联删除
   */
  async deleteServer(tenantId: string, serverId: string): Promise<void> {
    const server = await this.prisma.mtServer.findFirst({
      where: { tenantId, serverId },
    });

    if (!server) {
      throw new NotFoundException(`MT 服务器 ${serverId} 不存在`);
    }

    // 如果删除默认服务器，选择新的默认服务器
    if (server.isDefault) {
      const otherActive = await this.prisma.mtServer.findFirst({
        where: {
          tenantId,
          id: { not: server.id },
          isActive: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (otherActive) {
        await this.prisma.mtServer.update({
          where: { id: otherActive.id },
          data: { isDefault: true },
        });
      }
    }

    await this.prisma.mtServer.delete({
      where: { id: server.id },
    });

    // 清除认证会话缓存，确保 Dashboard 状态准确
    this.clearAuthSessionCache(tenantId, serverId);

    this.logger.log(`删除 MT 服务器: ${serverId} (租户: ${tenantId})`);
  }

  // ============================================================
  // 连接测试方法
  // ============================================================

  /**
   * 测试 MT 服务器连接
   * @param tenantId 租户 ID
   * @param serverId 服务器 ID
   * @returns 连接测试结果
   */
  async testConnection(
    tenantId: string,
    serverId: string,
  ): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    try {
      // 获取服务器配置
      const serverConfig = await this.getServerConfig(tenantId, serverId);

      // 获取适配器并测试连接
      const adapter = await this.adapterFactory.getAdapter(serverConfig);

      // 先进行认证
      await adapter.authenticate(
        serverConfig.managerLogin,
        serverConfig.managerPassword,
      );

      // 测试连接并获取服务器状态
      const [isConnected, serverStatus] = await Promise.all([
        adapter.testConnection(),
        adapter.getServerStatus().catch(() => null),
      ]);

      const latency = Date.now() - startTime;

      if (!isConnected) {
        // 记录失败
        this.adapterFactory.recordFailure(tenantId, serverId);
        return {
          success: false,
          latency,
          error: '无法连接到 MT 服务器',
        };
      }

      // 记录成功
      this.adapterFactory.recordSuccess(tenantId, serverId);

      this.logger.log(
        `MT 服务器连接测试成功: ${serverId} (租户: ${tenantId}, 延迟: ${latency}ms)`,
      );

      return {
        success: true,
        latency,
        serverVersion: serverStatus?.version,
        serverTime: serverStatus?.serverTime?.toISOString(),
      };
    } catch (error) {
      // 如果是 NotFoundException，重新抛出以返回 404
      if (error instanceof NotFoundException) {
        throw error;
      }

      const latency = Date.now() - startTime;

      // 记录失败
      this.adapterFactory.recordFailure(tenantId, serverId);

      this.logger.warn(
        `MT 服务器连接测试失败: ${serverId} (租户: ${tenantId}, 错误: ${error instanceof Error ? error.message : '未知错误'})`,
      );

      return {
        success: false,
        latency,
        error: error instanceof Error ? error.message : '连接测试失败',
      };
    }
  }

  // ============================================================
  // 私有辅助方法
  // ============================================================

  /**
   * 清除租户的默认服务器标志
   */
  private async clearDefaultServer(tenantId: string): Promise<void> {
    await this.prisma.mtServer.updateMany({
      where: { tenantId, isDefault: true },
      data: { isDefault: false },
    });
  }

  /**
   * 清除租户和服务器的中间件认证会话缓存
   * 当服务器配置发生变更时调用，确保 Dashboard 状态准确显示
   */
  private clearAuthSessionCache(tenantId: string, serverId: string): void {
    // 构建与 MiddlewareAuthService 相同的缓存键格式
    const cacheKey = `${tenantId}:${serverId}`;
    this.middlewareAuthService.clearSession(cacheKey);
    this.logger.debug(`已清除认证会话缓存: ${cacheKey}`);
  }

  /**
   * 验证中间件 URL 格式
   */
  private validateMiddlewareUrl(url: string): void {
    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch {
      throw new BadRequestException('无效的中间件 URL 格式');
    }
  }

  /**
   * 解密密码
   * 支持新格式 (Base64) 和旧格式 (ivHex:authTagHex:encrypted) 以保持向后兼容
   */
  private decryptPassword(encryptedPassword: string): string {
    try {
      // 检测格式：旧格式包含冒号，新格式是纯 Base64
      if (encryptedPassword.includes(':')) {
        // 旧格式: iv:authTag:encryptedData
        return this.decryptPasswordLegacy(encryptedPassword);
      } else {
        // 新格式: Base64(nonce || ciphertext || tag)
        return this.decryptPasswordNew(encryptedPassword);
      }
    } catch (error) {
      this.logger.error('密码解密失败', error);
      throw new Error('密码解密失败');
    }
  }

  /**
   * 新格式解密: Base64(nonce || ciphertext || tag)
   * 与 C++ 中间件的 CredentialEncryption 格式一致
   */
  private decryptPasswordNew(encryptedPassword: string): string {
    const NONCE_SIZE = 12;
    const TAG_SIZE = 16;

    const data = Buffer.from(encryptedPassword, 'base64');

    // 最小长度: nonce(12) + tag(16) = 28 字节
    if (data.length < NONCE_SIZE + TAG_SIZE) {
      throw new Error(`密文太短: ${data.length} 字节`);
    }

    const nonce = data.subarray(0, NONCE_SIZE);
    const authTag = data.subarray(data.length - TAG_SIZE);
    const ciphertext = data.subarray(NONCE_SIZE, data.length - TAG_SIZE);

    const key = this.deriveEncryptionKey();
    const decipher = crypto.createDecipheriv(this.encryptionAlgorithm, key, nonce);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  /**
   * 旧格式解密: ivHex:authTagHex:encryptedHex (向后兼容)
   */
  private decryptPasswordLegacy(encryptedPassword: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedPassword.split(':');

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    // 旧格式使用 scrypt 派生密钥
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);

    const decipher = crypto.createDecipheriv(
      this.encryptionAlgorithm,
      key,
      iv,
    );
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * 从配置密钥派生加密密钥
   * 支持十六进制字符串 (64字符 = 32字节) 或普通字符串
   */
  private deriveEncryptionKey(): Buffer {
    // 如果是 64 字符十六进制字符串，直接转换为字节
    if (this.encryptionKey.length === 64 && /^[0-9a-fA-F]+$/.test(this.encryptionKey)) {
      return Buffer.from(this.encryptionKey, 'hex');
    }
    // 否则使用 scrypt 派生
    return crypto.scryptSync(this.encryptionKey, 'salt', 32);
  }

  /**
   * 构建服务器配置
   */
  private async buildServerConfig(server: {
    id: string;
    tenantId: string;
    serverId: string;
    platformType: PrismaPlatformType;
    middlewareUrl: string;
    serverAddress: string;
  }): Promise<MtServerConfig> {
    // 获取默认经理账号
    let manager = await this.prisma.mtManager.findFirst({
      where: { mtServerId: server.id, isDefault: true, isActive: true },
    });

    if (!manager) {
      // 如果没有默认账号，获取第一个活跃账号
      manager = await this.prisma.mtManager.findFirst({
        where: { mtServerId: server.id, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!manager) {
      throw new NotFoundException(
        `MT 服务器 ${server.serverId} 没有可用的经理账号，请先添加经理账号`,
      );
    }

    return {
      tenantId: server.tenantId,
      serverId: server.serverId,
      platformType: this.mapPrismaPlatformType(server.platformType),
      middlewareUrl: server.middlewareUrl,
      serverAddress: server.serverAddress,
      managerLogin: Number(manager.managerLogin),
      managerPassword: this.decryptPassword(manager.managerPasswordEncrypted),
      managerId: manager.id,
    };
  }

  /**
   * 映射 Prisma 平台类型到适配器平台类型
   */
  private mapPrismaPlatformType(type: PrismaPlatformType): PlatformType {
    switch (type) {
      case 'MT5':
        return PlatformType.MT5;
      case 'MT4':
        return PlatformType.MT4;
      default:
        return PlatformType.MT5;
    }
  }

  /**
   * 映射适配器平台类型到 Prisma 平台类型
   */
  private mapToPrismaPlatformType(type: PlatformType): PrismaPlatformType {
    switch (type) {
      case PlatformType.MT5:
        return 'MT5';
      case PlatformType.MT4:
        return 'MT4';
      default:
        return 'MT5';
    }
  }

  /**
   * 映射数据库记录到 DTO
   */
  private mapToDto(server: {
    id: string;
    serverId: string;
    displayName: string | null;
    platformType: PrismaPlatformType;
    middlewareId: string | null;
    middlewareUrl: string;
    serverAddress: string;
    isActive: boolean;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
    _count: { managers: number };
    managers?: { managerLogin: bigint }[];
  }): MtServerDto {
    // 获取默认经理账号登录名
    const defaultManagerLogin = server.managers?.[0]?.managerLogin?.toString() || null;

    return {
      id: server.id,
      serverId: server.serverId,
      displayName: server.displayName,
      platformType: this.mapPrismaPlatformType(server.platformType),
      middlewareId: server.middlewareId,
      middlewareUrl: server.middlewareUrl,
      serverAddress: server.serverAddress,
      managerCount: server._count.managers,
      defaultManagerLogin,
      isActive: server.isActive,
      isDefault: server.isDefault,
      createdAt: server.createdAt.toISOString(),
      updatedAt: server.updatedAt.toISOString(),
    };
  }
}
