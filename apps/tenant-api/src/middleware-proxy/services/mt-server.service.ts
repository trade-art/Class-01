import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformType as PrismaPlatformType, Prisma } from '@prisma/client';
import { MtServerConfig, PlatformType } from '../adapters/types';
import * as crypto from 'crypto';

/**
 * MT 服务器列表项 DTO
 */
export interface MtServerDto {
  id: string;
  serverId: string;
  displayName: string | null;
  platformType: PlatformType;
  middlewareUrl: string;
  serverAddress: string;
  managerLogin: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 创建 MT 服务器 DTO
 */
export interface CreateMtServerDto {
  serverId: string;
  displayName?: string;
  platformType?: PlatformType;
  middlewareUrl: string;
  serverAddress: string;
  managerLogin: number;
  managerPassword: string;
  isDefault?: boolean;
}

/**
 * 更新 MT 服务器 DTO
 */
export interface UpdateMtServerDto {
  displayName?: string;
  middlewareUrl?: string;
  serverAddress?: string;
  managerLogin?: number;
  managerPassword?: string;
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
 */
@Injectable()
export class MtServerService {
  private readonly logger = new Logger(MtServerService.name);

  /**
   * 密码加密密钥 (生产环境应从配置中读取)
   */
  private readonly encryptionKey: string;
  private readonly encryptionAlgorithm = 'aes-256-gcm';

  constructor(private readonly prisma: PrismaService) {
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
    });

    if (!server) {
      throw new NotFoundException(`MT 服务器 ${serverId} 不存在`);
    }

    return this.mapToDto(server);
  }

  /**
   * 获取租户的默认 MT 服务器
   */
  async getDefaultServer(tenantId: string): Promise<MtServerDto | null> {
    const server = await this.prisma.mtServer.findFirst({
      where: { tenantId, isDefault: true, isActive: true },
    });

    if (!server) {
      // 如果没有默认服务器，返回第一个活跃服务器
      const firstActive = await this.prisma.mtServer.findFirst({
        where: { tenantId, isActive: true },
        orderBy: { createdAt: 'asc' },
      });

      return firstActive ? this.mapToDto(firstActive) : null;
    }

    return this.mapToDto(server);
  }

  /**
   * 获取服务器配置（用于创建适配器）
   * 包含解密后的管理员密码
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

    return {
      tenantId: server.tenantId,
      serverId: server.serverId,
      platformType: this.mapPrismaPlatformType(server.platformType),
      middlewareUrl: server.middlewareUrl,
      serverAddress: server.serverAddress,
      managerLogin: Number(server.managerLogin),
      managerPassword: this.decryptPassword(server.managerPasswordEncrypted),
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
   */
  async createServer(
    tenantId: string,
    dto: CreateMtServerDto,
  ): Promise<MtServerDto> {
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

    // 加密管理员密码
    const encryptedPassword = this.encryptPassword(dto.managerPassword);

    const server = await this.prisma.mtServer.create({
      data: {
        tenantId,
        serverId: dto.serverId,
        displayName: dto.displayName,
        platformType: this.mapToPrismaPlatformType(
          dto.platformType || PlatformType.MT5,
        ),
        middlewareUrl: dto.middlewareUrl,
        serverAddress: dto.serverAddress,
        managerLogin: BigInt(dto.managerLogin),
        managerPasswordEncrypted: encryptedPassword,
        isActive: true,
        isDefault: dto.isDefault ?? false,
      },
    });

    this.logger.log(
      `创建 MT 服务器: ${dto.serverId} (租户: ${tenantId}, 平台: ${dto.platformType || 'MT5'})`,
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

    if (dto.managerLogin !== undefined) {
      updateData.managerLogin = BigInt(dto.managerLogin);
    }

    if (dto.managerPassword) {
      updateData.managerPasswordEncrypted = this.encryptPassword(
        dto.managerPassword,
      );
    }

    if (dto.isDefault !== undefined) {
      updateData.isDefault = dto.isDefault;
    }

    const updated = await this.prisma.mtServer.update({
      where: { id: server.id },
      data: updateData,
    });

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
    });

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
    });

    this.logger.log(
      `设置默认 MT 服务器: ${serverId} (租户: ${tenantId})`,
    );

    return this.mapToDto(updated);
  }

  /**
   * 删除 MT 服务器
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

    this.logger.log(`删除 MT 服务器: ${serverId} (租户: ${tenantId})`);
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
   * 加密密码
   */
  private encryptPassword(password: string): string {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv(this.encryptionAlgorithm, key, iv);

    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // 格式: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * 解密密码
   */
  private decryptPassword(encryptedPassword: string): string {
    try {
      const [ivHex, authTagHex, encrypted] = encryptedPassword.split(':');

      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
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
    } catch (error) {
      this.logger.error('密码解密失败', error);
      throw new Error('密码解密失败');
    }
  }

  /**
   * 构建服务器配置
   */
  private buildServerConfig(server: {
    tenantId: string;
    serverId: string;
    platformType: PrismaPlatformType;
    middlewareUrl: string;
    serverAddress: string;
    managerLogin: bigint;
    managerPasswordEncrypted: string;
  }): MtServerConfig {
    return {
      tenantId: server.tenantId,
      serverId: server.serverId,
      platformType: this.mapPrismaPlatformType(server.platformType),
      middlewareUrl: server.middlewareUrl,
      serverAddress: server.serverAddress,
      managerLogin: Number(server.managerLogin),
      managerPassword: this.decryptPassword(server.managerPasswordEncrypted),
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
    middlewareUrl: string;
    serverAddress: string;
    managerLogin: bigint;
    isActive: boolean;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): MtServerDto {
    return {
      id: server.id,
      serverId: server.serverId,
      displayName: server.displayName,
      platformType: this.mapPrismaPlatformType(server.platformType),
      middlewareUrl: server.middlewareUrl,
      serverAddress: server.serverAddress,
      managerLogin: server.managerLogin.toString(),
      isActive: server.isActive,
      isDefault: server.isDefault,
      createdAt: server.createdAt.toISOString(),
      updatedAt: server.updatedAt.toISOString(),
    };
  }
}
