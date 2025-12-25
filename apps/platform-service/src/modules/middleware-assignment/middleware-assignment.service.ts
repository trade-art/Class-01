import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MiddlewareAssignmentResponseDto,
  TenantMiddlewareInfoDto,
  MiddlewareCapacityDto,
} from './dto';
import { MiddlewareAssignmentMode } from '@prisma/client';

/**
 * 中间件分配管理服务
 * 处理中间件与租户之间的分配关系
 */
@Injectable()
export class MiddlewareAssignmentService {
  private readonly logger = new Logger(MiddlewareAssignmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 分配租户到中间件
   * @param middlewareId 中间件 ID
   * @param tenantId 租户 ID
   * @param operatorId 操作人 ID
   * @returns 分配记录
   */
  async assign(
    middlewareId: string,
    tenantId: string,
    operatorId: string,
  ): Promise<MiddlewareAssignmentResponseDto> {
    // 1. 验证中间件存在
    const middleware = await this.prisma.middleware.findUnique({
      where: { id: middlewareId },
      include: {
        assignments: true,
      },
    });

    if (!middleware) {
      throw new NotFoundException(`中间件 ${middlewareId} 不存在`);
    }

    // 2. 验证租户存在
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`租户 ${tenantId} 不存在`);
    }

    // 3. 检查租户是否已有分配 (一个租户只能分配一个中间件)
    const existingTenantAssignment = await this.prisma.middlewareAssignment.findFirst({
      where: { tenantId },
      include: { middleware: { select: { name: true } } },
    });

    if (existingTenantAssignment) {
      throw new ConflictException(
        `租户 ${tenant.name} 已分配到中间件 "${existingTenantAssignment.middleware.name}"，请先取消现有分配`,
      );
    }

    // 4. 检查是否已经分配 (中间件-租户组合)
    const existingAssignment = await this.prisma.middlewareAssignment.findUnique({
      where: {
        middlewareId_tenantId: {
          middlewareId,
          tenantId,
        },
      },
    });

    if (existingAssignment) {
      throw new ConflictException(`租户 ${tenant.name} 已经分配到此中间件`);
    }

    // 5. 检查分配模式和容量
    if (middleware.assignmentMode === MiddlewareAssignmentMode.DEDICATED) {
      // 独占模式：只能分配给一个租户
      if (middleware.assignments.length > 0) {
        throw new ConflictException(
          `中间件 "${middleware.name}" 为独占模式，已分配给其他租户`,
        );
      }
    } else {
      // 共享模式：检查容量限制
      if (middleware.assignments.length >= middleware.maxTenants) {
        throw new ConflictException(
          `中间件 "${middleware.name}" 已达到最大租户数 ${middleware.maxTenants}`,
        );
      }
    }

    // 6. 检查租户是否有 MT 服务器配置 (可选警告，不阻止分配)
    const mtServerCount = await this.prisma.mtServer.count({
      where: { tenantId },
    });

    if (mtServerCount === 0) {
      this.logger.warn(
        `租户 ${tenant.name} (${tenantId}) 尚未配置 MT 服务器，分配中间件后需要配置服务器才能正常使用`,
      );
    }

    // 7. 解析中间件 URL 获取 host 和 port
    const { host, port } = this.parseMiddlewareUrl(middleware.url);

    // 8. 使用事务创建分配记录和实例
    const assignment = await this.prisma.$transaction(async (tx) => {
      // 8.1 创建分配记录
      const newAssignment = await tx.middlewareAssignment.create({
        data: {
          middlewareId,
          tenantId,
          assignedBy: operatorId,
        },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          middleware: {
            select: {
              id: true,
              name: true,
              url: true,
            },
          },
        },
      });

      // 8.2 自动创建中间件实例
      const instance = await tx.middlewareInstance.create({
        data: {
          tenantId,
          name: `${middleware.name} - ${tenant.name}`,
          description: middleware.description || `${tenant.name} 的中间件实例`,
          platformType: middleware.platformType,
          serverIp: middleware.serverIp,
          host,
          port,
          apiKey: middleware.apiKey || '', // 中间件注册后才会有 API Key
          useTls: middleware.url.startsWith('https'),
          status: 'OFFLINE', // 初始状态为离线，等待健康检查
          maxSessions: (tenant as any).maxSessions || 100,
          maxManagers: (tenant as any).maxManagerAccounts || 10,
        },
      });

      this.logger.log(
        `为租户 "${tenant.name}" 创建中间件实例 "${instance.name}" (ID: ${instance.id})`,
      );

      return newAssignment;
    });

    this.logger.log(
      `分配租户 "${tenant.name}" 到中间件 "${middleware.name}" (操作人: ${operatorId})`,
    );

    return this.toResponseDto(assignment);
  }

  /**
   * 取消租户的中间件分配
   * @param middlewareId 中间件 ID
   * @param tenantId 租户 ID
   */
  async unassign(middlewareId: string, tenantId: string): Promise<void> {
    // 验证分配关系存在
    const assignment = await this.prisma.middlewareAssignment.findUnique({
      where: {
        middlewareId_tenantId: {
          middlewareId,
          tenantId,
        },
      },
      include: {
        tenant: { select: { name: true } },
        middleware: { select: { name: true } },
      },
    });

    if (!assignment) {
      throw new NotFoundException(`租户与中间件的分配关系不存在`);
    }

    // 使用事务确保分配记录和实例一起删除
    await this.prisma.$transaction(async (tx) => {
      // 1. 先删除租户关联的所有中间件实例
      const deletedInstances = await tx.middlewareInstance.deleteMany({
        where: { tenantId },
      });

      if (deletedInstances.count > 0) {
        this.logger.log(
          `删除租户 "${assignment.tenant.name}" 的 ${deletedInstances.count} 个中间件实例`,
        );
      }

      // 2. 删除分配记录
      await tx.middlewareAssignment.delete({
        where: {
          middlewareId_tenantId: {
            middlewareId,
            tenantId,
          },
        },
      });
    });

    this.logger.log(
      `取消租户 "${assignment.tenant.name}" 与中间件 "${assignment.middleware.name}" 的分配`,
    );
  }

  /**
   * 获取中间件的所有分配租户
   * @param middlewareId 中间件 ID
   * @returns 分配列表
   */
  async getAssignmentsByMiddleware(
    middlewareId: string,
  ): Promise<MiddlewareAssignmentResponseDto[]> {
    // 验证中间件存在
    const middleware = await this.prisma.middleware.findUnique({
      where: { id: middlewareId },
    });

    if (!middleware) {
      throw new NotFoundException(`中间件 ${middlewareId} 不存在`);
    }

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
        middleware: {
          select: {
            id: true,
            name: true,
            url: true,
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    return assignments.map((a) => this.toResponseDto(a));
  }

  /**
   * 获取租户的中间件分配信息
   * @param tenantId 租户 ID
   * @returns 租户的中间件信息
   */
  async getMiddlewareByTenant(tenantId: string): Promise<TenantMiddlewareInfoDto | null> {
    // 验证租户存在
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`租户 ${tenantId} 不存在`);
    }

    const assignment = await this.prisma.middlewareAssignment.findFirst({
      where: { tenantId },
      include: {
        middleware: {
          select: {
            id: true,
            name: true,
            url: true,
          },
        },
      },
    });

    if (!assignment) {
      return null;
    }

    // 检查是否有 MT 服务器配置
    const mtServerCount = await this.prisma.mtServer.count({
      where: { tenantId, isActive: true },
    });

    return {
      middlewareId: assignment.middleware.id,
      middlewareName: assignment.middleware.name,
      middlewareUrl: assignment.middleware.url,
      assignedAt: assignment.assignedAt,
      hasMtServerConfig: mtServerCount > 0,
    };
  }

  /**
   * 获取所有中间件的容量信息
   * @returns 容量列表
   */
  async getAllMiddlewareCapacity(): Promise<MiddlewareCapacityDto[]> {
    const middlewares = await this.prisma.middleware.findMany({
      include: {
        _count: {
          select: { assignments: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return middlewares.map((m) => {
      const currentTenants = m._count.assignments;
      const availableSlots =
        m.assignmentMode === MiddlewareAssignmentMode.DEDICATED
          ? currentTenants === 0
            ? 1
            : 0
          : m.maxTenants - currentTenants;

      return {
        id: m.id,
        name: m.name,
        assignmentMode: m.assignmentMode,
        maxTenants: m.maxTenants,
        currentTenants,
        availableSlots: Math.max(0, availableSlots),
        canAssign: availableSlots > 0,
      };
    });
  }

  /**
   * 获取可分配的中间件列表 (有剩余容量)
   * @returns 可分配的中间件列表
   */
  async getAvailableMiddlewares(): Promise<MiddlewareCapacityDto[]> {
    const allCapacity = await this.getAllMiddlewareCapacity();
    return allCapacity.filter((m) => m.canAssign);
  }

  /**
   * 批量分配租户到中间件 (用于初始化或迁移)
   * @param middlewareId 中间件 ID
   * @param tenantIds 租户 ID 列表
   * @param operatorId 操作人 ID
   * @returns 分配结果
   */
  async batchAssign(
    middlewareId: string,
    tenantIds: string[],
    operatorId: string,
  ): Promise<{
    success: string[];
    failed: { tenantId: string; reason: string }[];
  }> {
    const success: string[] = [];
    const failed: { tenantId: string; reason: string }[] = [];

    for (const tenantId of tenantIds) {
      try {
        await this.assign(middlewareId, tenantId, operatorId);
        success.push(tenantId);
      } catch (error) {
        failed.push({
          tenantId,
          reason: error instanceof Error ? error.message : '未知错误',
        });
      }
    }

    return { success, failed };
  }

  /**
   * 转换为响应 DTO
   */
  private toResponseDto(
    assignment: {
      id: string;
      middlewareId: string;
      tenantId: string;
      assignedAt: Date;
      assignedBy: string;
      tenant?: { id: string; name: string; code: string };
      middleware?: { id: string; name: string; url: string };
    },
  ): MiddlewareAssignmentResponseDto {
    return {
      id: assignment.id,
      middlewareId: assignment.middlewareId,
      tenantId: assignment.tenantId,
      assignedAt: assignment.assignedAt,
      assignedBy: assignment.assignedBy,
      tenant: assignment.tenant,
      middleware: assignment.middleware,
    };
  }

  /**
   * 解析中间件 URL 获取 host 和 port
   * @param url 中间件 URL (e.g., http://192.168.1.100:8083)
   * @returns { host, port }
   */
  private parseMiddlewareUrl(url: string): { host: string; port: number } {
    try {
      const parsedUrl = new URL(url);
      const host = parsedUrl.hostname;
      const port = parsedUrl.port
        ? parseInt(parsedUrl.port, 10)
        : parsedUrl.protocol === 'https:'
          ? 443
          : 80;
      return { host, port };
    } catch {
      // 如果 URL 解析失败，尝试简单解析
      const match = url.match(/^(?:https?:\/\/)?([^:\/]+)(?::(\d+))?/);
      if (match) {
        return {
          host: match[1],
          port: match[2] ? parseInt(match[2], 10) : 8080,
        };
      }
      // 默认值
      return { host: url, port: 8080 };
    }
  }
}
