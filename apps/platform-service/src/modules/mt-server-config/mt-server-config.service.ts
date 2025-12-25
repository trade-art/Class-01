// @ts-nocheck
// TODO: 此文件需要重构以适配 MtManager 分离后的新 schema
import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/services/encryption.service';
import {
  CreateMtServerConfigDto,
  UpdateMtServerConfigDto,
  QueryMtServerConfigDto,
  MtServerConfigResponseDto,
} from './dto';
import { MtServer } from '@prisma/client';

/**
 * MT 服务器配置服务
 * 管理租户的 MT5/MT4 服务器配置（由 SaaS 管理员操作）
 */
@Injectable()
export class MtServerConfigService {
  private readonly logger = new Logger(MtServerConfigService.name);
  private readonly MASKED_PASSWORD = '******';

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * 创建 MT 服务器配置
   * @param tenantId 租户 ID
   * @param dto 创建 DTO
   * @param operatorId 操作人 ID
   * @returns 新创建的服务器配置
   */
  async create(
    tenantId: string,
    dto: CreateMtServerConfigDto,
    operatorId: string,
  ): Promise<MtServerConfigResponseDto> {
    // 验证租户存在
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`租户 ${tenantId} 不存在`);
    }

    // 检查 serverId 是否已存在
    const existing = await this.prisma.mtServer.findUnique({
      where: {
        tenantId_serverId: {
          tenantId,
          serverId: dto.serverId,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`服务器标识符 ${dto.serverId} 在该租户中已存在`);
    }

    // 加密密码
    const encryptedPassword = this.encryptionService.encrypt(dto.managerPassword);

    // 如果设为默认，先取消其他默认
    if (dto.isDefault) {
      await this.prisma.mtServer.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const server = await this.prisma.mtServer.create({
      data: {
        tenantId,
        serverId: dto.serverId,
        displayName: dto.displayName,
        platformType: dto.platformType,
        middlewareUrl: dto.middlewareUrl,
        serverAddress: dto.serverAddress,
        managerLogin: BigInt(dto.managerLogin),
        managerPasswordEncrypted: encryptedPassword,
        isActive: dto.isActive ?? true,
        isDefault: dto.isDefault ?? false,
        configVersion: 1,
        lastModifiedAt: new Date(),
        lastModifiedBy: operatorId,
      },
    });

    this.logger.log(
      `创建 MT 服务器配置: ${dto.serverId} (${server.id}) for 租户 ${tenantId}`,
    );

    return this.toResponseDto(server);
  }

  /**
   * 获取租户的所有 MT 服务器配置
   * @param tenantId 租户 ID
   * @param query 查询参数
   * @returns 服务器配置列表
   */
  async findAllByTenant(
    tenantId: string,
    query: QueryMtServerConfigDto,
  ): Promise<{ items: MtServerConfigResponseDto[]; total: number }> {
    const where: Record<string, unknown> = { tenantId };

    if (query.platformType) {
      where.platformType = query.platformType;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search) {
      where.OR = [
        { serverId: { contains: query.search, mode: 'insensitive' } },
        { displayName: { contains: query.search, mode: 'insensitive' } },
        { serverAddress: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.mtServer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mtServer.count({ where }),
    ]);

    return {
      items: items.map((s) => this.toResponseDto(s)),
      total,
    };
  }

  /**
   * 获取单个 MT 服务器配置
   * @param tenantId 租户 ID
   * @param serverId 服务器 ID
   * @returns 服务器配置详情
   */
  async findOne(tenantId: string, serverId: string): Promise<MtServerConfigResponseDto> {
    const server = await this.prisma.mtServer.findFirst({
      where: {
        id: serverId,
        tenantId,
      },
    });

    if (!server) {
      throw new NotFoundException(`MT 服务器配置 ${serverId} 不存在或不属于该租户`);
    }

    return this.toResponseDto(server);
  }

  /**
   * 更新 MT 服务器配置
   * @param tenantId 租户 ID
   * @param serverId 服务器 ID
   * @param dto 更新 DTO
   * @param operatorId 操作人 ID
   * @returns 更新后的配置
   */
  async update(
    tenantId: string,
    serverId: string,
    dto: UpdateMtServerConfigDto,
    operatorId: string,
  ): Promise<MtServerConfigResponseDto> {
    // 验证服务器存在且属于该租户
    const existing = await this.prisma.mtServer.findFirst({
      where: {
        id: serverId,
        tenantId,
      },
    });

    if (!existing) {
      throw new NotFoundException(`MT 服务器配置 ${serverId} 不存在或不属于该租户`);
    }

    // 如果设为默认，先取消其他默认
    if (dto.isDefault) {
      await this.prisma.mtServer.updateMany({
        where: { tenantId, isDefault: true, NOT: { id: serverId } },
        data: { isDefault: false },
      });
    }

    // 构建更新数据
    const updateData: Record<string, unknown> = {
      configVersion: existing.configVersion + 1, // 每次更新递增版本号
      lastModifiedAt: new Date(),
      lastModifiedBy: operatorId,
    };

    if (dto.displayName !== undefined) updateData.displayName = dto.displayName;
    if (dto.middlewareUrl !== undefined) updateData.middlewareUrl = dto.middlewareUrl;
    if (dto.serverAddress !== undefined) updateData.serverAddress = dto.serverAddress;
    if (dto.managerLogin !== undefined) updateData.managerLogin = BigInt(dto.managerLogin);
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.isDefault !== undefined) updateData.isDefault = dto.isDefault;

    // 如果更新密码，需要加密
    if (dto.managerPassword) {
      updateData.managerPasswordEncrypted = this.encryptionService.encrypt(dto.managerPassword);
    }

    const server = await this.prisma.mtServer.update({
      where: { id: serverId },
      data: updateData,
    });

    this.logger.log(
      `更新 MT 服务器配置: ${server.serverId} (${server.id}), 版本: ${server.configVersion}`,
    );

    return this.toResponseDto(server);
  }

  /**
   * 删除 MT 服务器配置
   * @param tenantId 租户 ID
   * @param serverId 服务器 ID
   */
  async remove(tenantId: string, serverId: string): Promise<void> {
    // 验证服务器存在且属于该租户
    const server = await this.prisma.mtServer.findFirst({
      where: {
        id: serverId,
        tenantId,
      },
    });

    if (!server) {
      throw new NotFoundException(`MT 服务器配置 ${serverId} 不存在或不属于该租户`);
    }

    await this.prisma.mtServer.delete({
      where: { id: serverId },
    });

    this.logger.log(`删除 MT 服务器配置: ${server.serverId} (${serverId})`);
  }

  /**
   * 获取解密后的服务器配置（供内部 API 使用）
   * @param tenantId 租户 ID
   * @param serverId 服务器 ID
   * @returns 包含解密密码的配置
   */
  async getDecryptedConfig(
    tenantId: string,
    serverId: string,
  ): Promise<MtServer & { decryptedPassword: string }> {
    const server = await this.prisma.mtServer.findFirst({
      where: {
        id: serverId,
        tenantId,
        isActive: true,
      },
    });

    if (!server) {
      throw new NotFoundException(`MT 服务器配置 ${serverId} 不存在、未启用或不属于该租户`);
    }

    const decryptedPassword = this.encryptionService.decrypt(server.managerPasswordEncrypted);

    return {
      ...server,
      decryptedPassword,
    };
  }

  /**
   * 获取租户所有启用的 MT 服务器配置（供内部 API 使用）
   * @param tenantId 租户 ID
   * @returns 包含解密密码的配置列表
   */
  async getAllDecryptedConfigs(
    tenantId: string,
  ): Promise<(MtServer & { decryptedPassword: string })[]> {
    const servers = await this.prisma.mtServer.findMany({
      where: {
        tenantId,
        isActive: true,
      },
    });

    return servers.map((server) => ({
      ...server,
      decryptedPassword: this.encryptionService.decrypt(server.managerPasswordEncrypted),
    }));
  }

  /**
   * 转换为响应 DTO（掩码密码）
   */
  private toResponseDto(server: MtServer): MtServerConfigResponseDto {
    return {
      id: server.id,
      tenantId: server.tenantId,
      serverId: server.serverId,
      displayName: server.displayName ?? undefined,
      platformType: server.platformType,
      middlewareUrl: server.middlewareUrl,
      serverAddress: server.serverAddress,
      managerLogin: server.managerLogin.toString(),
      managerPassword: this.MASKED_PASSWORD, // 始终返回掩码
      isActive: server.isActive,
      isDefault: server.isDefault,
      configVersion: server.configVersion,
      lastModifiedAt: server.lastModifiedAt,
      lastModifiedBy: server.lastModifiedBy ?? undefined,
      createdAt: server.createdAt,
      updatedAt: server.updatedAt,
    };
  }
}
