import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MiddlewareInstanceDto, MiddlewareInstanceListResponseDto } from './dto';
import { MiddlewareProxyService } from '../middleware-proxy';

/**
 * 经理账号连接状态
 */
export type ManagerStatus = 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONFIGURED';

/**
 * 中间件实例服务
 * 提供分配给当前租户的中间件实例查询功能
 */
@Injectable()
export class MiddlewareInstanceService {
  private readonly logger = new Logger(MiddlewareInstanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly middlewareProxy: MiddlewareProxyService,
  ) {}

  /**
   * 获取分配给租户的中间件实例列表
   */
  async getMiddlewares(
    tenantId: string,
  ): Promise<MiddlewareInstanceListResponseDto> {
    this.logger.log(`获取租户 ${tenantId} 的中间件实例列表`);

    // 通过 middleware_assignments 表查询分配给该租户的中间件
    const assignments = await this.prisma.middlewareAssignment.findMany({
      where: {
        tenantId,
      },
      include: {
        middleware: true,
      },
      orderBy: {
        assignedAt: 'desc',
      },
    });

    // 并行测试所有中间件的真实认证状态
    // 注意：每个中间件需要单独检查其关联的 MtServer 和 MtManager
    const middlewares: MiddlewareInstanceDto[] = await Promise.all(
      assignments.map(async (assignment) => {
        const isOnline = assignment.middleware.status === 'ONLINE';
        const middlewareId = assignment.middleware.id;

        // 获取此中间件关联的经理账号配置状态
        const managerInfo = await this.getManagerConfigStatus(
          tenantId,
          middlewareId,
        );

        // 获取真实的认证状态
        const managerStatus = await this.determineManagerStatus(
          managerInfo.hasManager,
          managerInfo.hasActiveManager,
          assignment.middleware.status,
          middlewareId,
          tenantId,
        );

        return {
          id: middlewareId,
          name: assignment.middleware.name,
          description: assignment.middleware.description ?? undefined,
          url: assignment.middleware.url,
          platformType: assignment.middleware.platformType,
          status: assignment.middleware.status,
          serverIp: assignment.middleware.serverIp ?? undefined,
          lastHeartbeat: assignment.middleware.lastHeartbeat ?? undefined,
          // 仅在中间件在线时返回实时指标
          activeSessions: isOnline ? assignment.middleware.activeSessions : 0,
          memoryUsagePercent: isOnline
            ? (assignment.middleware.memoryUsagePercent ?? undefined)
            : undefined,
          cpuUsage: isOnline
            ? (assignment.middleware.cpuUsage ?? undefined)
            : undefined,
          assignedAt: assignment.assignedAt,
          // 经理账号连接状态（真实认证测试）
          managerStatus,
          defaultManagerLogin: managerInfo.defaultManagerLogin,
        };
      }),
    );

    return {
      middlewares,
      total: middlewares.length,
    };
  }

  /**
   * 获取中间件关联的经理账号配置状态
   *
   * 正确的查询路径：
   * 1. 通过 middlewareId + tenantId 找到关联的 MtServer
   * 2. 通过 MtServer.id (mtServerId) 查找 MtManager
   *
   * 返回值说明：
   * - hasManager: 是否存在任何经理账号记录（用于区分"未配置"和"已禁用"）
   * - hasActiveManager: 是否存在活跃的经理账号
   * - defaultManagerLogin: 默认或首个经理账号的登录名
   */
  private async getManagerConfigStatus(
    tenantId: string,
    middlewareId: string,
  ): Promise<{ hasManager: boolean; hasActiveManager: boolean; defaultManagerLogin?: string }> {
    // 1. 首先查找该中间件关联的 MtServer
    const mtServer = await this.prisma.mtServer.findFirst({
      where: {
        tenantId,
        middlewareId,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (!mtServer) {
      this.logger.debug(
        `租户 ${tenantId} 的中间件 ${middlewareId} 未关联任何 MtServer`,
      );
      return { hasManager: false, hasActiveManager: false };
    }

    // 2. 检查是否存在任何经理账号（不管 isActive 状态）
    const anyManager = await this.prisma.mtManager.findFirst({
      where: {
        mtServerId: mtServer.id,
      },
      select: {
        managerLogin: true,
        isActive: true,
      },
    });

    if (!anyManager) {
      // 完全没有配置经理账号
      return { hasManager: false, hasActiveManager: false };
    }

    // 3. 通过 MtServer.id 查找活跃的默认经理账号
    const defaultManager = await this.prisma.mtManager.findFirst({
      where: {
        mtServerId: mtServer.id,
        isActive: true,
        isDefault: true,
      },
      select: {
        managerLogin: true,
      },
    });

    if (defaultManager) {
      return {
        hasManager: true,
        hasActiveManager: true,
        defaultManagerLogin: defaultManager.managerLogin.toString(),
      };
    }

    // 4. 如果没有默认经理账号，检查是否有任何活跃的经理账号
    const anyActiveManager = await this.prisma.mtManager.findFirst({
      where: {
        mtServerId: mtServer.id,
        isActive: true,
      },
      select: {
        managerLogin: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // 返回第一个经理账号的登录名（即使已禁用，也用于显示）
    return {
      hasManager: true,
      hasActiveManager: !!anyActiveManager,
      defaultManagerLogin: anyActiveManager?.managerLogin.toString() || anyManager.managerLogin.toString(),
    };
  }

  /**
   * 判断经理账号连接状态（真实认证测试）
   * - NOT_CONFIGURED: 完全没有配置经理账号
   * - CONNECTED: 有活跃经理账号且 MT5 API 认证成功
   * - DISCONNECTED: 有经理账号但被禁用、无法连接或中间件离线
   */
  private async determineManagerStatus(
    hasManager: boolean,
    hasActiveManager: boolean,
    middlewareStatus: string,
    middlewareId: string,
    tenantId: string,
  ): Promise<ManagerStatus> {
    // 完全没有配置经理账号
    if (!hasManager) {
      return 'NOT_CONFIGURED';
    }

    // 有经理账号但都被禁用
    if (!hasActiveManager) {
      return 'DISCONNECTED';
    }

    // 中间件离线
    if (middlewareStatus !== 'ONLINE') {
      return 'DISCONNECTED';
    }

    // 中间件在线时，测试真实的 MT5 API 认证状态
    try {
      const isAuthenticated = await this.middlewareProxy.testAuthentication(
        middlewareId,
        tenantId,
      );
      return isAuthenticated ? 'CONNECTED' : 'DISCONNECTED';
    } catch (error) {
      this.logger.warn(
        `测试中间件 ${middlewareId} 认证状态失败: ${error.message}`,
      );
      return 'DISCONNECTED';
    }
  }

  /**
   * 获取单个中间件实例详情
   */
  async getMiddleware(
    tenantId: string,
    middlewareId: string,
  ): Promise<MiddlewareInstanceDto | null> {
    const assignment = await this.prisma.middlewareAssignment.findUnique({
      where: {
        middlewareId_tenantId: {
          middlewareId,
          tenantId,
        },
      },
      include: {
        middleware: true,
      },
    });

    if (!assignment) {
      return null;
    }

    // 获取此中间件关联的经理账号配置状态
    const managerInfo = await this.getManagerConfigStatus(tenantId, middlewareId);
    const isOnline = assignment.middleware.status === 'ONLINE';

    // 获取真实的认证状态
    const managerStatus = await this.determineManagerStatus(
      managerInfo.hasManager,
      managerInfo.hasActiveManager,
      assignment.middleware.status,
      assignment.middleware.id,
      tenantId,
    );

    return {
      id: assignment.middleware.id,
      name: assignment.middleware.name,
      description: assignment.middleware.description ?? undefined,
      url: assignment.middleware.url,
      platformType: assignment.middleware.platformType,
      status: assignment.middleware.status,
      serverIp: assignment.middleware.serverIp ?? undefined,
      lastHeartbeat: assignment.middleware.lastHeartbeat ?? undefined,
      // 仅在中间件在线时返回实时指标
      activeSessions: isOnline ? assignment.middleware.activeSessions : 0,
      memoryUsagePercent: isOnline
        ? (assignment.middleware.memoryUsagePercent ?? undefined)
        : undefined,
      cpuUsage: isOnline
        ? (assignment.middleware.cpuUsage ?? undefined)
        : undefined,
      assignedAt: assignment.assignedAt,
      // 经理账号连接状态（真实认证测试）
      managerStatus,
      defaultManagerLogin: managerInfo.defaultManagerLogin,
    };
  }
}
