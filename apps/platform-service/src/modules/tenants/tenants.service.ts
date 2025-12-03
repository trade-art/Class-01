import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
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

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async findOne(id: string): Promise<Tenant> {
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
            status: true,
            lastHealthCheck: true,
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

    return tenant;
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

    return this.prisma.tenant.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  async suspend(id: string): Promise<Tenant> {
    await this.findOne(id);

    return this.prisma.tenant.update({
      where: { id },
      data: { status: 'SUSPENDED' },
    });
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
          allowedTransitions: this.statusTransitions[tenant.status],
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
