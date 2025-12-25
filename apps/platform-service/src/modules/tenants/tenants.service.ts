import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateTenantDto,
  UpdateTenantDto,
  UpdateBrandingDto,
  TenantQueryDto,
  PaginatedTenantsResponseDto,
  TenantStatus,
} from './dto/tenant.dto';
import { Tenant, Prisma, TenantStatus as PrismaTenantStatus } from '@prisma/client';
import { BusinessException, ErrorCodes } from '../../common/exceptions';
import { MiddlewareClientService } from '../middleware-integration/services/middleware-client.service';

/**
 * 经理账号连接状态
 */
export type ManagerStatus = 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONFIGURED';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly middlewareClient: MiddlewareClientService,
  ) {}

  async create(createTenantDto: CreateTenantDto): Promise<Tenant> {
    // Check if code already exists
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { code: createTenantDto.code },
    });

    if (existingTenant) {
      throw new ConflictException(`Tenant with code '${createTenantDto.code}' already exists`);
    }

    return this.prisma.tenant.create({
      data: {
        name: createTenantDto.name,
        code: createTenantDto.code,
        email: createTenantDto.email,
        phone: createTenantDto.phone,
        company: createTenantDto.company,
        plan: createTenantDto.plan || 'BASIC',
        maxInstances: createTenantDto.maxInstances || 1,
        maxAdmins: createTenantDto.maxAdmins || 3,
        billingCycle: createTenantDto.billingCycle || 'MONTHLY',
        billingEmail: createTenantDto.billingEmail,
        notes: createTenantDto.notes,
        status: 'PENDING',
      },
    });
  }

  async findAll(query: TenantQueryDto): Promise<PaginatedTenantsResponseDto> {
    const { search, status, plan, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.TenantWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (plan) {
      where.plan = plan;
    }

    const [data, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              admins: true,
              instances: true,
            },
          },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return {
      data: data as any,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<any> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        admins: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            lastLogin: true,
            createdAt: true,
          },
        },
        instances: {
          select: {
            id: true,
            name: true,
            host: true,
            port: true,
            platformType: true,
            status: true,
            lastHealthCheck: true,
          },
        },
        middlewareAssignments: {
          select: {
            id: true,
            middlewareId: true,
            assignedAt: true,
            assignedBy: true,
            middleware: {
              select: {
                id: true,
                name: true,
                url: true,
                platformType: true,
                status: true,
                assignmentMode: true,
              },
            },
          },
        },
        _count: {
          select: {
            admins: true,
            instances: true,
            invoices: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${id}' not found`);
    }

    // 获取租户的经理账号配置状态
    const managerInfo = await this.getManagerConfigStatus(id);

    // 为每个中间件分配添加经理账号连接状态（使用真实认证测试）
    const middlewareAssignmentsWithStatus = await Promise.all(
      tenant.middlewareAssignments.map(async (assignment) => {
        const managerStatus = await this.determineManagerStatus(
          managerInfo.hasActiveManager,
          assignment.middleware?.status || 'OFFLINE',
          assignment.middleware?.url || '',
          id,
        );
        return {
          ...assignment,
          managerStatus,
          defaultManagerLogin: managerInfo.defaultManagerLogin,
        };
      }),
    );

    return {
      ...tenant,
      middlewareAssignments: middlewareAssignmentsWithStatus,
    };
  }

  /**
   * 获取租户的经理账号配置状态
   */
  private async getManagerConfigStatus(
    tenantId: string,
  ): Promise<{ hasActiveManager: boolean; defaultManagerLogin?: string }> {
    // 查询租户是否有活跃的默认经理账号
    const defaultManager = await this.prisma.mtManager.findFirst({
      where: {
        tenantId,
        isActive: true,
        isDefault: true,
      },
      select: {
        managerLogin: true,
      },
    });

    if (defaultManager) {
      return {
        hasActiveManager: true,
        defaultManagerLogin: defaultManager.managerLogin.toString(),
      };
    }

    // 如果没有默认经理账号，检查是否有任何活跃的经理账号
    const anyActiveManager = await this.prisma.mtManager.findFirst({
      where: {
        tenantId,
        isActive: true,
      },
      select: {
        managerLogin: true,
      },
    });

    return {
      hasActiveManager: !!anyActiveManager,
      defaultManagerLogin: anyActiveManager?.managerLogin.toString(),
    };
  }

  /**
   * 判断经理账号连接状态（真实认证测试）
   * - NOT_CONFIGURED: 未配置活跃的经理账号
   * - CONNECTED: 有经理账号且 MT5 API 认证成功
   * - DISCONNECTED: 有经理账号但 MT5 API 认证失败或中间件离线
   */
  private async determineManagerStatus(
    hasActiveManager: boolean,
    middlewareStatus: string,
    middlewareUrl: string,
    tenantId: string,
  ): Promise<ManagerStatus> {
    if (!hasActiveManager) {
      return 'NOT_CONFIGURED';
    }

    if (middlewareStatus !== 'ONLINE') {
      return 'DISCONNECTED';
    }

    // 中间件在线时，测试真实的 MT5 API 认证状态
    try {
      const isAuthenticated = await this.testTenantAuthentication(
        middlewareUrl,
        tenantId,
      );
      return isAuthenticated ? 'CONNECTED' : 'DISCONNECTED';
    } catch (error) {
      this.logger.warn(
        `测试租户 ${tenantId} 的 MT5 认证状态失败: ${error.message}`,
      );
      return 'DISCONNECTED';
    }
  }

  /**
   * 测试租户的 MT5 API 认证
   * 获取租户的 MT 服务器配置和经理账号，调用中间件进行真实认证测试
   */
  private async testTenantAuthentication(
    middlewareUrl: string,
    tenantId: string,
  ): Promise<boolean> {
    // 获取租户的默认 MT 服务器配置
    const mtServer = await this.prisma.mtServer.findFirst({
      where: {
        tenantId,
        isActive: true,
        isDefault: true,
      },
      include: {
        managers: {
          where: {
            isActive: true,
            isDefault: true,
          },
          take: 1,
        },
      },
    });

    // 如果没有默认服务器，尝试获取任意活跃服务器
    const serverConfig = mtServer ?? await this.prisma.mtServer.findFirst({
      where: {
        tenantId,
        isActive: true,
      },
      include: {
        managers: {
          where: {
            isActive: true,
          },
          take: 1,
        },
      },
    });

    if (!serverConfig || serverConfig.managers.length === 0) {
      this.logger.debug(`租户 ${tenantId} 没有配置活跃的 MT 服务器或经理账号`);
      return false;
    }

    const manager = serverConfig.managers[0];

    // 解密经理账号密码
    const managerPassword = this.decryptManagerPassword(
      manager.managerPasswordEncrypted,
    );

    // 调用中间件测试认证
    return this.middlewareClient.testAuthentication(
      middlewareUrl,
      Number(manager.managerLogin),
      managerPassword,
      serverConfig.serverAddress,
      serverConfig.serverId,
      tenantId,
    );
  }

  /**
   * 解密经理账号密码
   * TODO: 实现真正的解密逻辑
   */
  private decryptManagerPassword(encryptedPassword: string): string {
    // 目前密码是明文存储的，直接返回
    // TODO: 使用加密服务解密
    return encryptedPassword;
  }

  async findByCode(code: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { code },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with code '${code}' not found`);
    }

    return tenant;
  }

  async update(id: string, updateTenantDto: UpdateTenantDto): Promise<Tenant> {
    // Check if tenant exists
    await this.findOne(id);

    // Check if code is being updated and if it conflicts
    if (updateTenantDto.code) {
      const existingTenant = await this.prisma.tenant.findFirst({
        where: {
          code: updateTenantDto.code,
          NOT: { id },
        },
      });

      if (existingTenant) {
        throw new ConflictException(`Tenant with code '${updateTenantDto.code}' already exists`);
      }
    }

    return this.prisma.tenant.update({
      where: { id },
      data: updateTenantDto,
    });
  }

  async remove(id: string): Promise<void> {
    // Check if tenant exists
    await this.findOne(id);

    await this.prisma.tenant.delete({
      where: { id },
    });
  }

  async activate(id: string): Promise<Tenant> {
    await this.findOne(id);

    // 使用事务同时更新租户状态和实例状态
    const [tenant] = await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { id },
        data: { status: 'ACTIVE' },
      }),
      // 将所有 SUSPENDED 状态的实例恢复为 OFFLINE（等待健康检查）
      this.prisma.middlewareInstance.updateMany({
        where: { tenantId: id, status: 'SUSPENDED' },
        data: { status: 'OFFLINE' },
      }),
    ]);

    return tenant;
  }

  async suspend(id: string): Promise<Tenant> {
    await this.findOne(id);

    // 使用事务同时更新租户状态和实例状态
    const [tenant] = await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { id },
        data: { status: 'SUSPENDED' },
      }),
      // 将所有实例状态设为 SUSPENDED
      this.prisma.middlewareInstance.updateMany({
        where: { tenantId: id },
        data: { status: 'SUSPENDED' },
      }),
    ]);

    return tenant;
  }

  async getStats(): Promise<{
    total: number;
    active: number;
    pending: number;
    suspended: number;
    byPlan: Record<string, number>;
  }> {
    const [total, active, pending, suspended, byPlan] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.tenant.count({ where: { status: 'PENDING' } }),
      this.prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.tenant.groupBy({
        by: ['plan'],
        _count: { plan: true },
      }),
    ]);

    const planStats: Record<string, number> = {};
    byPlan.forEach((item) => {
      planStats[item.plan] = item._count.plan;
    });

    return {
      total,
      active,
      pending,
      suspended,
      byPlan: planStats,
    };
  }

  /**
   * 获取租户关联数据统计（用于删除确认）
   */
  async getRelatedDataCount(id: string): Promise<{
    instances: number;
    admins: number;
    mtServers: number;
  }> {
    await this.findOne(id);

    const [instances, admins, mtServers] = await Promise.all([
      this.prisma.middlewareInstance.count({ where: { tenantId: id } }),
      this.prisma.tenantAdmin.count({ where: { tenantId: id } }),
      this.prisma.mtServer.count({ where: { tenantId: id } }),
    ]);

    return { instances, admins, mtServers };
  }

  // ==================== REQ-3: 白标配置 ====================

  /**
   * 更新租户白标配置
   */
  async updateBranding(id: string, dto: UpdateBrandingDto): Promise<Tenant> {
    await this.findOne(id);

    return this.prisma.tenant.update({
      where: { id },
      data: {
        displayName: dto.displayName,
        logo: dto.logoUrl,
        primaryColor: dto.primaryColor,
      },
    });
  }

  /**
   * 获取租户白标配置
   */
  async getBranding(id: string): Promise<{
    displayName: string | null;
    logo: string | null;
    primaryColor: string | null;
  }> {
    const tenant = await this.findOne(id);
    return {
      displayName: tenant.displayName,
      logo: tenant.logo,
      primaryColor: tenant.primaryColor,
    };
  }

  // ==================== REQ-2: 状态管理 ====================

  /**
   * 状态转换规则定义
   */
  private readonly statusTransitions: Record<PrismaTenantStatus, PrismaTenantStatus[]> = {
    PENDING: ['ACTIVE', 'CANCELLED'],
    ACTIVE: ['SUSPENDED', 'EXPIRED'],
    SUSPENDED: ['ACTIVE', 'CANCELLED'],
    EXPIRED: ['ACTIVE', 'CANCELLED'],
    CANCELLED: [], // 终态，不能转换
  };

  /**
   * 验证状态转换是否有效
   */
  private validateStatusTransition(
    current: PrismaTenantStatus,
    target: PrismaTenantStatus,
  ): boolean {
    const allowedTransitions = this.statusTransitions[current];
    return allowedTransitions.includes(target);
  }

  /**
   * 更新租户状态 (带验证)
   */
  async updateStatus(id: string, targetStatus: TenantStatus): Promise<Tenant> {
    const tenant = await this.findOne(id);

    if (!this.validateStatusTransition(tenant.status, targetStatus as PrismaTenantStatus)) {
      throw BusinessException.unprocessable(
        ErrorCodes.TENANT_422_003,
        `无法从 ${tenant.status} 转换到 ${targetStatus}`,
        {
          currentStatus: tenant.status,
          targetStatus,
          allowedTransitions: this.statusTransitions[tenant.status as PrismaTenantStatus],
        },
      );
    }

    return this.prisma.tenant.update({
      where: { id },
      data: { status: targetStatus as PrismaTenantStatus },
    });
  }

  /**
   * 终止租户 (设置为 CANCELLED)
   */
  async terminate(id: string): Promise<Tenant> {
    return this.updateStatus(id, TenantStatus.CANCELLED);
  }

  /**
   * 恢复租户 (从 SUSPENDED/EXPIRED 恢复为 ACTIVE)
   */
  async restore(id: string): Promise<Tenant> {
    return this.updateStatus(id, TenantStatus.ACTIVE);
  }

  /**
   * 设置租户过期
   */
  async expire(id: string): Promise<Tenant> {
    return this.updateStatus(id, TenantStatus.EXPIRED);
  }
}
