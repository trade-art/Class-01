// @ts-nocheck
// TODO: 此文件需要重构以适配 MtManager 分离后的新 schema
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/services/encryption.service';
import {
  MiddlewareConfigResponseDto,
  TenantConfigDto,
  MtServerConfigDto,
  HeartbeatDto,
  HeartbeatResponseDto,
} from './dto';
import { MiddlewareStatus } from '@prisma/client';

/**
 * 中间件配置服务
 * 供中间件实例拉取配置和上报心跳
 */
@Injectable()
export class MiddlewareConfigService {
  private readonly logger = new Logger(MiddlewareConfigService.name);

  // 心跳间隔 (秒)
  private readonly DEFAULT_HEARTBEAT_INTERVAL = 30;

  // 配置版本缓存 (middlewareId -> lastKnownConfigVersion)
  private configVersionCache = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * 获取中间件配置
   * 返回分配给该中间件的所有租户配置，包含解密后的敏感信息
   *
   * @param middlewareId 中间件 ID
   * @returns 中间件配置
   */
  async getConfig(middlewareId: string): Promise<MiddlewareConfigResponseDto> {
    // 获取中间件信息
    const middleware = await this.prisma.middleware.findUnique({
      where: { id: middlewareId },
    });

    if (!middleware) {
      throw new Error(`中间件 ${middlewareId} 不存在`);
    }

    // 获取分配给该中间件的所有租户
    const assignments = await this.prisma.middlewareAssignment.findMany({
      where: { middlewareId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    // 收集所有租户 ID
    const tenantIds = assignments.map((a) => a.tenantId);

    // 获取这些租户的所有 MT 服务器配置
    const mtServers = await this.prisma.mtServer.findMany({
      where: {
        tenantId: { in: tenantIds },
        isActive: true,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    // 计算最大配置版本号
    const maxConfigVersion = mtServers.length > 0
      ? Math.max(...mtServers.map((s) => s.configVersion))
      : 0;

    // 按租户分组 MT 服务器
    const serversByTenant = new Map<string, typeof mtServers>();
    for (const server of mtServers) {
      if (!serversByTenant.has(server.tenantId)) {
        serversByTenant.set(server.tenantId, []);
      }
      serversByTenant.get(server.tenantId)!.push(server);
    }

    // 构建租户配置列表
    const tenants: TenantConfigDto[] = assignments.map((assignment) => {
      const tenantServers = serversByTenant.get(assignment.tenantId) || [];

      return {
        tenantId: assignment.tenant.id,
        tenantCode: assignment.tenant.code,
        tenantName: assignment.tenant.name,
        mtServers: tenantServers.map((server) => this.toMtServerConfigDto(server)),
      };
    });

    // 更新配置版本缓存
    this.configVersionCache.set(middlewareId, maxConfigVersion);

    this.logger.debug(
      `返回中间件 ${middleware.name} 配置: ${tenants.length} 个租户, ` +
      `${mtServers.length} 个服务器, 版本 ${maxConfigVersion}`,
    );

    return {
      middlewareId: middleware.id,
      middlewareName: middleware.name,
      configVersion: maxConfigVersion,
      configUpdatedAt: new Date(),
      tenants,
    };
  }

  /**
   * 处理中间件心跳上报
   *
   * @param middlewareId 中间件 ID
   * @param heartbeat 心跳数据
   * @returns 心跳响应
   */
  async handleHeartbeat(
    middlewareId: string,
    heartbeat: HeartbeatDto,
  ): Promise<HeartbeatResponseDto> {
    // 映射状态字符串到枚举
    let status: MiddlewareStatus = MiddlewareStatus.ONLINE;
    if (heartbeat.status) {
      switch (heartbeat.status.toLowerCase()) {
        case 'healthy':
          status = MiddlewareStatus.ONLINE;
          break;
        case 'degraded':
          status = MiddlewareStatus.DEGRADED;
          break;
        case 'unhealthy':
        case 'error':
          status = MiddlewareStatus.ERROR;
          break;
        default:
          status = MiddlewareStatus.UNKNOWN;
      }
    }

    // 更新中间件状态
    await this.prisma.middleware.update({
      where: { id: middlewareId },
      data: {
        status,
        serverIp: heartbeat.serverIp,
        activeSessions: heartbeat.activeSessions,
        memoryUsage: heartbeat.memoryUsage,
        cpuUsage: heartbeat.cpuUsage,
        cacheStatus: heartbeat.cacheStatus as object | undefined,
        lastHeartbeat: new Date(),
      },
    });

    // 检查是否有配置更新
    const lastKnownVersion = this.configVersionCache.get(middlewareId) || 0;
    const currentConfig = await this.getLatestConfigVersion(middlewareId);
    const configUpdated = currentConfig > lastKnownVersion;

    this.logger.debug(
      `中间件 ${middlewareId} 心跳: status=${status}, ` +
      `sessions=${heartbeat.activeSessions || 0}, ` +
      `configUpdated=${configUpdated}`,
    );

    return {
      success: true,
      nextHeartbeatInterval: this.DEFAULT_HEARTBEAT_INTERVAL,
      configUpdated,
      newConfigVersion: configUpdated ? currentConfig : undefined,
    };
  }

  /**
   * 获取最新的配置版本号
   */
  private async getLatestConfigVersion(middlewareId: string): Promise<number> {
    // 获取分配给该中间件的租户
    const assignments = await this.prisma.middlewareAssignment.findMany({
      where: { middlewareId },
      select: { tenantId: true },
    });

    if (assignments.length === 0) {
      return 0;
    }

    const tenantIds = assignments.map((a) => a.tenantId);

    // 获取最大配置版本
    const result = await this.prisma.mtServer.aggregate({
      where: {
        tenantId: { in: tenantIds },
        isActive: true,
      },
      _max: {
        configVersion: true,
      },
    });

    return result._max.configVersion || 0;
  }

  /**
   * 转换为 MT 服务器配置 DTO (包含解密密码)
   */
  private toMtServerConfigDto(server: {
    id: string;
    serverId: string;
    displayName: string | null;
    platformType: string;
    middlewareUrl: string;
    serverAddress: string;
    managerLogin: bigint;
    managerPasswordEncrypted: string;
    isActive: boolean;
    isDefault: boolean;
    configVersion: number;
    lastModifiedAt: Date;
  }): MtServerConfigDto {
    // 解密管理员密码
    let decryptedPassword = '';
    try {
      decryptedPassword = this.encryptionService.decrypt(server.managerPasswordEncrypted);
    } catch (error) {
      this.logger.error(`解密服务器 ${server.serverId} 密码失败: ${error}`);
    }

    return {
      id: server.id,
      serverId: server.serverId,
      displayName: server.displayName ?? undefined,
      platformType: server.platformType,
      middlewareUrl: server.middlewareUrl,
      serverAddress: server.serverAddress,
      managerLogin: server.managerLogin.toString(),
      managerPassword: decryptedPassword,
      isActive: server.isActive,
      isDefault: server.isDefault,
      configVersion: server.configVersion,
      lastModifiedAt: server.lastModifiedAt,
    };
  }
}
