import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformType as PrismaPlatformType, Prisma } from '@prisma/client';
import { MtServerConfig, PlatformType } from '../middleware-proxy/adapters/types';
import { AdapterFactory } from '../middleware-proxy/adapters/adapter.factory';
import { MiddlewareAuthService } from '../middleware-proxy/services/middleware-auth.service';
import { MiddlewareNotifierService, ManagerNotifyInfo } from './middleware-notifier.service';
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
 * MT 经理账号 DTO
 */
export interface MtManagerDto {
  id: string;
  mtServerId: string;
  serverName: string | null;
  serverId: string;
  platformType: string;
  managerLogin: string;
  displayName: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  // API Key 相关字段
  apiKeyId: string | null;
  apiKeyEnabled: boolean;
  apiKeyCreatedAt: string | null;
  apiKeyLastUsedAt: string | null;
}

/**
 * 创建 MT 经理账号 DTO
 */
export interface CreateMtManagerDto {
  mtServerId: string;
  managerLogin: number;
  managerPassword: string;
  displayName?: string;
  isDefault?: boolean;
}

/**
 * 更新 MT 经理账号 DTO
 */
export interface UpdateMtManagerDto {
  managerPassword?: string;
  displayName?: string;
  isDefault?: boolean;
}

/**
 * MT 经理账号列表响应 DTO
 */
export interface MtManagerListResponseDto {
  managers: MtManagerDto[];
  total: number;
}

/**
 * MT 经理账号服务
 * 管理租户的 MT 经理账号配置
 */
@Injectable()
export class MtManagerService {
  private readonly logger = new Logger(MtManagerService.name);

  /**
   * 密码加密密钥 (生产环境应从配置中读取)
   */
  private readonly encryptionKey: string;
  private readonly encryptionAlgorithm = 'aes-256-gcm';

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapterFactory: AdapterFactory,
    private readonly middlewareAuthService: MiddlewareAuthService,
    private readonly middlewareNotifier: MiddlewareNotifierService,
  ) {
    this.encryptionKey =
      process.env.MT_SERVER_ENCRYPTION_KEY ||
      'mt5platform2024encryptionkey1234';
  }

  // ============================================================
  // 内部接口查询方法 (供 C++ 中间件调用)
  // ============================================================

  /**
   * 根据中间件实例 ID 获取需要预连接的所有启用经理账号
   * 用于 C++ 中间件启动时建立连接池
   *
   * @param middlewareId 中间件实例 UUID
   * @returns 经理账号列表，包含连接所需的所有信息
   */
  async findByMiddlewareId(middlewareId: string): Promise<{
    managers: Array<{
      managerId: string;
      tenantId: string;
      mtServerId: string;
      serverAddress: string;
      managerLogin: string;
      encryptedPassword: string;
    }>;
    total: number;
  }> {
    // 查询指定中间件实例关联的所有启用 MT 服务器下的启用经理账号
    const managers = await this.prisma.mtManager.findMany({
      where: {
        isActive: true,
        server: {
          middlewareId: middlewareId,
          isActive: true,
        },
      },
      include: {
        server: {
          select: {
            id: true,
            serverAddress: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    this.logger.log(
      `查询中间件 ${middlewareId} 的经理账号列表: 找到 ${managers.length} 个启用账号`,
    );

    return {
      managers: managers.map((manager) => ({
        managerId: manager.id,
        tenantId: manager.tenantId,
        mtServerId: manager.mtServerId,
        serverAddress: manager.server.serverAddress,
        managerLogin: manager.managerLogin.toString(),
        encryptedPassword: manager.managerPasswordEncrypted,
      })),
      total: managers.length,
    };
  }

  // ============================================================
  // 查询方法
  // ============================================================

  /**
   * 获取租户的所有 MT 经理账号
   */
  async getManagers(tenantId: string): Promise<MtManagerListResponseDto> {
    const managers = await this.prisma.mtManager.findMany({
      where: { tenantId },
      include: {
        server: {
          select: {
            id: true,
            serverId: true,
            displayName: true,
            platformType: true,
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      managers: managers.map((manager) => this.mapToDto(manager)),
      total: managers.length,
    };
  }

  /**
   * 获取单个 MT 经理账号
   */
  async getManager(tenantId: string, managerId: string): Promise<MtManagerDto> {
    const manager = await this.prisma.mtManager.findFirst({
      where: { tenantId, id: managerId },
      include: {
        server: {
          select: {
            id: true,
            serverId: true,
            displayName: true,
            platformType: true,
          },
        },
      },
    });

    if (!manager) {
      throw new NotFoundException(`MT 经理账号不存在`);
    }

    return this.mapToDto(manager);
  }

  /**
   * 获取指定服务器的经理账号列表
   */
  async getManagersByServer(
    tenantId: string,
    mtServerId: string,
  ): Promise<MtManagerListResponseDto> {
    // 验证服务器属于该租户
    const server = await this.prisma.mtServer.findFirst({
      where: { tenantId, id: mtServerId },
    });

    if (!server) {
      throw new NotFoundException(`MT 服务器不存在`);
    }

    const managers = await this.prisma.mtManager.findMany({
      where: { tenantId, mtServerId },
      include: {
        server: {
          select: {
            id: true,
            serverId: true,
            displayName: true,
            platformType: true,
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      managers: managers.map((manager) => this.mapToDto(manager)),
      total: managers.length,
    };
  }

  /**
   * 获取服务器的默认经理账号配置（用于创建适配器）
   * 包含解密后的管理员密码
   */
  async getDefaultManagerConfig(
    tenantId: string,
    mtServerId: string,
  ): Promise<MtServerConfig> {
    // 获取服务器信息
    const server = await this.prisma.mtServer.findFirst({
      where: { tenantId, id: mtServerId, isActive: true },
    });

    if (!server) {
      throw new NotFoundException(`MT 服务器不存在或未激活`);
    }

    // 获取默认经理账号
    let manager = await this.prisma.mtManager.findFirst({
      where: { mtServerId, isDefault: true, isActive: true },
    });

    if (!manager) {
      // 如果没有默认账号，获取第一个活跃账号
      manager = await this.prisma.mtManager.findFirst({
        where: { mtServerId, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!manager) {
      throw new NotFoundException(`服务器 ${server.serverId} 没有可用的经理账号`);
    }

    return {
      tenantId: server.tenantId,
      serverId: server.serverId,
      platformType: this.mapPrismaPlatformType(server.platformType),
      middlewareUrl: server.middlewareUrl,
      serverAddress: server.serverAddress,
      managerLogin: Number(manager.managerLogin),
      managerPassword: this.decryptPassword(manager.managerPasswordEncrypted),
    };
  }

  /**
   * 获取指定经理账号的配置（用于连接测试）
   */
  async getManagerConfig(
    tenantId: string,
    managerId: string,
  ): Promise<MtServerConfig> {
    const manager = await this.prisma.mtManager.findFirst({
      where: { tenantId, id: managerId },
      include: { server: true },
    });

    if (!manager) {
      throw new NotFoundException(`MT 经理账号不存在`);
    }

    if (!manager.server.isActive) {
      throw new NotFoundException(`关联的 MT 服务器未激活`);
    }

    // 检查中间件是否配置
    if (!manager.server.middlewareId || !manager.server.middlewareUrl) {
      throw new BadRequestException(`MT 服务器未配置中间件实例，请先在 MT 服务器设置中选择中间件`);
    }

    return {
      tenantId: manager.tenantId,
      serverId: manager.server.serverId,
      platformType: this.mapPrismaPlatformType(manager.server.platformType),
      middlewareUrl: manager.server.middlewareUrl,
      serverAddress: manager.server.serverAddress,
      managerLogin: Number(manager.managerLogin),
      managerPassword: this.decryptPassword(manager.managerPasswordEncrypted),
    };
  }

  // ============================================================
  // 创建/更新/删除方法
  // ============================================================

  /**
   * 创建 MT 经理账号
   */
  async createManager(
    tenantId: string,
    dto: CreateMtManagerDto,
  ): Promise<MtManagerDto> {
    // 获取租户配额信息
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        maxManagerAccounts: true,
        _count: { select: { mtServers: true } },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`租户不存在`);
    }

    // 检查服务器是否属于该租户
    const server = await this.prisma.mtServer.findFirst({
      where: { tenantId, id: dto.mtServerId },
    });

    if (!server) {
      throw new NotFoundException(`MT 服务器不存在`);
    }

    // 检查经理账号数量配额
    const currentManagerCount = await this.prisma.mtManager.count({
      where: { tenantId },
    });

    if (currentManagerCount >= tenant.maxManagerAccounts) {
      throw new ForbiddenException(
        `已达到最大经理账号数量限制 (${tenant.maxManagerAccounts})，请联系管理员升级套餐`,
      );
    }

    // 检查该服务器是否已有相同登录号的经理账号
    const existing = await this.prisma.mtManager.findFirst({
      where: {
        mtServerId: dto.mtServerId,
        managerLogin: BigInt(dto.managerLogin),
      },
    });

    if (existing) {
      throw new ConflictException(
        `该服务器已存在登录号为 ${dto.managerLogin} 的经理账号`,
      );
    }

    // 如果设置为默认，取消其他默认账号
    if (dto.isDefault) {
      await this.clearDefaultManager(dto.mtServerId);
    }

    // 加密管理员密码
    const encryptedPassword = this.encryptPassword(dto.managerPassword);

    const manager = await this.prisma.mtManager.create({
      data: {
        tenantId,
        mtServerId: dto.mtServerId,
        managerLogin: BigInt(dto.managerLogin),
        managerPasswordEncrypted: encryptedPassword,
        displayName: dto.displayName,
        isActive: true,
        isDefault: dto.isDefault ?? false,
      },
      include: {
        server: {
          select: {
            id: true,
            serverId: true,
            displayName: true,
            platformType: true,
            serverAddress: true,
          },
        },
      },
    });

    // 清除认证会话缓存，确保 Dashboard 状态准确
    this.clearAuthSessionCache(tenantId, server.serverId);

    // 通知中间件添加新连接到连接池
    this.notifyMiddlewareAddConnection(manager, encryptedPassword);

    this.logger.log(
      `创建 MT 经理账号: ${dto.managerLogin} (租户: ${tenantId}, 服务器: ${server.serverId})`,
    );

    return this.mapToDto(manager);
  }

  /**
   * 更新 MT 经理账号
   */
  async updateManager(
    tenantId: string,
    managerId: string,
    dto: UpdateMtManagerDto,
  ): Promise<MtManagerDto> {
    const manager = await this.prisma.mtManager.findFirst({
      where: { tenantId, id: managerId },
      include: {
        server: {
          select: {
            id: true,
            serverId: true,
            displayName: true,
            platformType: true,
            serverAddress: true,
          },
        },
      },
    });

    if (!manager) {
      throw new NotFoundException(`MT 经理账号不存在`);
    }

    // 如果设置为默认，取消其他默认账号
    if (dto.isDefault && !manager.isDefault) {
      await this.clearDefaultManager(manager.mtServerId);
    }

    const updateData: Prisma.MtManagerUpdateInput = {
      displayName: dto.displayName,
    };

    let newEncryptedPassword: string | undefined;
    if (dto.managerPassword) {
      newEncryptedPassword = this.encryptPassword(dto.managerPassword);
      updateData.managerPasswordEncrypted = newEncryptedPassword;
    }

    if (dto.isDefault !== undefined) {
      updateData.isDefault = dto.isDefault;
    }

    const updated = await this.prisma.mtManager.update({
      where: { id: manager.id },
      data: updateData,
      include: {
        server: {
          select: {
            id: true,
            serverId: true,
            displayName: true,
            platformType: true,
            serverAddress: true,
          },
        },
      },
    });

    // 清除认证会话缓存，确保 Dashboard 状态准确（特别是密码变更后）
    this.clearAuthSessionCache(tenantId, manager.server.serverId);

    // 如果密码变更，通知中间件更新连接
    if (newEncryptedPassword && manager.isActive) {
      this.notifyMiddlewareUpdateConnection(updated, newEncryptedPassword);
    }

    this.logger.log(
      `更新 MT 经理账号: ${manager.managerLogin} (租户: ${tenantId})`,
    );

    return this.mapToDto(updated);
  }

  /**
   * 切换 MT 经理账号状态
   */
  async toggleManagerStatus(
    tenantId: string,
    managerId: string,
    isActive: boolean,
  ): Promise<MtManagerDto> {
    const manager = await this.prisma.mtManager.findFirst({
      where: { tenantId, id: managerId },
      include: {
        server: {
          select: {
            id: true,
            serverId: true,
            displayName: true,
            platformType: true,
            serverAddress: true,
          },
        },
      },
    });

    if (!manager) {
      throw new NotFoundException(`MT 经理账号不存在`);
    }

    // 如果禁用默认账号，需要选择新的默认账号
    if (!isActive && manager.isDefault) {
      const otherActive = await this.prisma.mtManager.findFirst({
        where: {
          mtServerId: manager.mtServerId,
          id: { not: manager.id },
          isActive: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (otherActive) {
        await this.prisma.mtManager.update({
          where: { id: otherActive.id },
          data: { isDefault: true },
        });
      }
    }

    const updated = await this.prisma.mtManager.update({
      where: { id: manager.id },
      data: {
        isActive,
        isDefault: isActive ? manager.isDefault : false,
      },
      include: {
        server: {
          select: {
            id: true,
            serverId: true,
            displayName: true,
            platformType: true,
            serverAddress: true,
          },
        },
      },
    });

    // 清除认证会话缓存，确保 Dashboard 状态准确
    this.clearAuthSessionCache(tenantId, manager.server.serverId);

    // 通知中间件状态变更：禁用时移除连接，启用时添加连接
    if (!isActive && manager.isActive) {
      // 从启用变为禁用 -> 通知中间件移除连接
      this.notifyMiddlewareRemoveConnection(manager.id, manager.mtServerId);
    } else if (isActive && !manager.isActive) {
      // 从禁用变为启用 -> 通知中间件添加连接
      this.notifyMiddlewareAddConnection(updated, manager.managerPasswordEncrypted);
    }

    this.logger.log(
      `${isActive ? '启用' : '禁用'} MT 经理账号: ${manager.managerLogin} (租户: ${tenantId})`,
    );

    return this.mapToDto(updated);
  }

  /**
   * 设置默认 MT 经理账号
   */
  async setDefaultManager(
    tenantId: string,
    managerId: string,
  ): Promise<MtManagerDto> {
    const manager = await this.prisma.mtManager.findFirst({
      where: { tenantId, id: managerId, isActive: true },
      include: {
        server: {
          select: {
            id: true,
            serverId: true,
            displayName: true,
            platformType: true,
          },
        },
      },
    });

    if (!manager) {
      throw new NotFoundException(`MT 经理账号不存在或未激活`);
    }

    // 取消其他默认账号
    await this.clearDefaultManager(manager.mtServerId);

    const updated = await this.prisma.mtManager.update({
      where: { id: manager.id },
      data: { isDefault: true },
      include: {
        server: {
          select: {
            id: true,
            serverId: true,
            displayName: true,
            platformType: true,
          },
        },
      },
    });

    // 清除认证会话缓存，确保使用新的默认经理账号凭证
    this.clearAuthSessionCache(tenantId, manager.server.serverId);

    this.logger.log(
      `设置默认 MT 经理账号: ${manager.managerLogin} (租户: ${tenantId})`,
    );

    return this.mapToDto(updated);
  }

  /**
   * 删除 MT 经理账号
   */
  async deleteManager(tenantId: string, managerId: string): Promise<void> {
    const manager = await this.prisma.mtManager.findFirst({
      where: { tenantId, id: managerId },
      include: {
        server: {
          select: { serverId: true, id: true },
        },
      },
    });

    if (!manager) {
      throw new NotFoundException(`MT 经理账号不存在`);
    }

    // 如果删除默认账号，选择新的默认账号
    if (manager.isDefault) {
      const otherActive = await this.prisma.mtManager.findFirst({
        where: {
          mtServerId: manager.mtServerId,
          id: { not: manager.id },
          isActive: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (otherActive) {
        await this.prisma.mtManager.update({
          where: { id: otherActive.id },
          data: { isDefault: true },
        });
      }
    }

    // 保存删除前的信息用于通知
    const mtServerId = manager.mtServerId;
    const wasActive = manager.isActive;

    await this.prisma.mtManager.delete({
      where: { id: manager.id },
    });

    // 清除认证会话缓存，确保 Dashboard 状态准确
    this.clearAuthSessionCache(tenantId, manager.server.serverId);

    // 如果该账号处于启用状态，通知中间件移除连接
    if (wasActive) {
      this.notifyMiddlewareRemoveConnection(managerId, mtServerId);
    }

    this.logger.log(
      `删除 MT 经理账号: ${manager.managerLogin} (租户: ${tenantId})`,
    );
  }

  // ============================================================
  // 连接测试方法
  // ============================================================

  /**
   * 测试 MT 经理账号连接
   */
  async testConnection(
    tenantId: string,
    managerId: string,
  ): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    try {
      // 获取经理账号配置
      const config = await this.getManagerConfig(tenantId, managerId);

      // 获取适配器并测试连接
      const adapter = await this.adapterFactory.getAdapter(config);

      // 先进行认证
      await adapter.authenticate(config.managerLogin, config.managerPassword);

      // 测试连接并获取服务器状态
      const [isConnected, serverStatus] = await Promise.all([
        adapter.testConnection(),
        adapter.getServerStatus().catch(() => null),
      ]);

      const latency = Date.now() - startTime;

      if (!isConnected) {
        this.adapterFactory.recordFailure(tenantId, config.serverId);
        return {
          success: false,
          latency,
          error: '无法连接到 MT 服务器',
        };
      }

      this.adapterFactory.recordSuccess(tenantId, config.serverId);

      this.logger.log(
        `MT 经理账号连接测试成功: ${config.managerLogin} (租户: ${tenantId}, 延迟: ${latency}ms)`,
      );

      return {
        success: true,
        latency,
        serverVersion: serverStatus?.version,
        serverTime: serverStatus?.serverTime?.toISOString(),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      const latency = Date.now() - startTime;

      this.logger.warn(
        `MT 经理账号连接测试失败: ${managerId} (租户: ${tenantId}, 错误: ${error instanceof Error ? error.message : '未知错误'})`,
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
   * 清除服务器的默认经理账号标志
   */
  private async clearDefaultManager(mtServerId: string): Promise<void> {
    await this.prisma.mtManager.updateMany({
      where: { mtServerId, isDefault: true },
      data: { isDefault: false },
    });
  }

  /**
   * 清除租户和服务器的中间件认证会话缓存
   * 当经理账号发生变更时调用，确保 Dashboard 状态准确显示
   */
  private clearAuthSessionCache(tenantId: string, serverId: string): void {
    // 构建与 MiddlewareAuthService 相同的缓存键格式
    const cacheKey = `${tenantId}:${serverId}`;
    this.middlewareAuthService.clearSession(cacheKey);
    this.logger.debug(`已清除认证会话缓存: ${cacheKey}`);
  }

  /**
   * 加密密码
   * 使用与 C++ 中间件兼容的格式: Base64(nonce(12) || ciphertext || tag(16))
   * 这样 C++ 中间件可以直接解密
   */
  private encryptPassword(password: string): string {
    // 使用 12 字节 nonce (与 C++ 中间件的 NONCE_SIZE 一致)
    const nonce = crypto.randomBytes(12);
    // 从十六进制密钥派生 32 字节密钥
    const key = this.deriveEncryptionKey();
    const cipher = crypto.createCipheriv(this.encryptionAlgorithm, key, nonce);

    const encrypted = Buffer.concat([
      cipher.update(password, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // 格式: Base64(nonce || ciphertext || tag)
    // 与 C++ 中间件 CredentialEncryption 格式完全一致
    const combined = Buffer.concat([nonce, encrypted, authTag]);
    return combined.toString('base64');
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
    // 否则使用 SHA256 哈希生成 32 字节密钥
    return crypto.createHash('sha256').update(this.encryptionKey).digest();
  }

  // ============================================================
  // 中间件通知辅助方法 (异步执行，不阻塞主流程)
  // ============================================================

  /**
   * 通知中间件添加新连接到连接池
   * @param manager 经理账号数据（包含服务器信息）
   * @param encryptedPassword 加密后的密码
   */
  private notifyMiddlewareAddConnection(
    manager: {
      id: string;
      tenantId: string;
      mtServerId: string;
      managerLogin: bigint;
      server: { serverAddress: string };
    },
    encryptedPassword: string,
  ): void {
    const managerInfo: ManagerNotifyInfo = {
      managerId: manager.id,
      tenantId: manager.tenantId,
      mtServerId: manager.mtServerId,
      serverAddress: manager.server.serverAddress,
      managerLogin: manager.managerLogin.toString(),
      encryptedPassword,
    };

    // 异步通知，不阻塞主流程
    this.middlewareNotifier.notifyAdd(managerInfo).catch((error) => {
      this.logger.warn(
        `通知中间件添加连接失败 (managerId: ${manager.id}): ${error instanceof Error ? error.message : '未知错误'}`,
      );
    });
  }

  /**
   * 通知中间件更新连接（密码变更时触发重连）
   * @param manager 经理账号数据（包含服务器信息）
   * @param newEncryptedPassword 新的加密密码
   */
  private notifyMiddlewareUpdateConnection(
    manager: {
      id: string;
      tenantId: string;
      mtServerId: string;
      managerLogin: bigint;
      server: { serverAddress: string };
    },
    newEncryptedPassword: string,
  ): void {
    const managerInfo: ManagerNotifyInfo = {
      managerId: manager.id,
      tenantId: manager.tenantId,
      mtServerId: manager.mtServerId,
      serverAddress: manager.server.serverAddress,
      managerLogin: manager.managerLogin.toString(),
      encryptedPassword: newEncryptedPassword,
    };

    // 异步通知，不阻塞主流程
    this.middlewareNotifier.notifyUpdate(managerInfo).catch((error) => {
      this.logger.warn(
        `通知中间件更新连接失败 (managerId: ${manager.id}): ${error instanceof Error ? error.message : '未知错误'}`,
      );
    });
  }

  /**
   * 通知中间件移除连接
   * @param managerId 经理账号 UUID
   * @param mtServerId MT 服务器 ID
   */
  private notifyMiddlewareRemoveConnection(
    managerId: string,
    mtServerId: string,
  ): void {
    // 异步通知，不阻塞主流程
    this.middlewareNotifier.notifyRemove(managerId, mtServerId).catch((error) => {
      this.logger.warn(
        `通知中间件移除连接失败 (managerId: ${managerId}): ${error instanceof Error ? error.message : '未知错误'}`,
      );
    });
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
   * 映射数据库记录到 DTO
   */
  private mapToDto(manager: {
    id: string;
    mtServerId: string;
    managerLogin: bigint;
    displayName: string | null;
    isActive: boolean;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
    // API Key 字段
    apiKeyId?: string | null;
    apiKeyEnabled?: boolean;
    apiKeyCreatedAt?: Date | null;
    apiKeyLastUsedAt?: Date | null;
    server: {
      id: string;
      serverId: string;
      displayName: string | null;
      platformType: PrismaPlatformType;
    };
  }): MtManagerDto {
    return {
      id: manager.id,
      mtServerId: manager.mtServerId,
      serverName: manager.server.displayName || manager.server.serverId,
      serverId: manager.server.serverId,
      platformType: manager.server.platformType,
      managerLogin: manager.managerLogin.toString(),
      displayName: manager.displayName,
      isActive: manager.isActive,
      isDefault: manager.isDefault,
      createdAt: manager.createdAt.toISOString(),
      updatedAt: manager.updatedAt.toISOString(),
      // API Key 字段
      apiKeyId: manager.apiKeyId ?? null,
      apiKeyEnabled: manager.apiKeyEnabled ?? false,
      apiKeyCreatedAt: manager.apiKeyCreatedAt?.toISOString() ?? null,
      apiKeyLastUsedAt: manager.apiKeyLastUsedAt?.toISOString() ?? null,
    };
  }
}
