import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateTenantAdminDto,
  UpdateTenantAdminDto,
  ChangePasswordDto,
  TenantAdminQueryDto,
  TenantAdminResponseDto,
  TenantRole,
} from './dto/tenant-admin.dto';
import { Prisma, TenantAdmin } from '@prisma/client';
import { BusinessException, ErrorCodes } from '../../common/exceptions';
import * as bcrypt from 'bcrypt';

@Injectable()
export class TenantAdminsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建租户管理员
   */
  async create(dto: CreateTenantAdminDto): Promise<TenantAdmin> {
    // 验证租户存在并检查配额
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
      include: {
        _count: { select: { admins: true } },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${dto.tenantId}' not found`);
    }

    // 检查管理员配额
    if (tenant._count.admins >= tenant.maxAdmins) {
      throw BusinessException.unprocessable(
        ErrorCodes.TENANT_422_003,
        `租户已达到管理员上限 (${tenant.maxAdmins})`,
        { currentCount: tenant._count.admins, maxAdmins: tenant.maxAdmins },
      );
    }

    // 检查邮箱是否已存在于该租户
    const existingAdmin = await this.prisma.tenantAdmin.findFirst({
      where: {
        tenantId: dto.tenantId,
        email: dto.email,
      },
    });

    if (existingAdmin) {
      throw new ConflictException(`Email '${dto.email}' already exists for this tenant`);
    }

    // 哈希密码
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    return this.prisma.tenantAdmin.create({
      data: {
        tenantId: dto.tenantId,
        email: dto.email,
        name: dto.name,
        password: hashedPassword,
        role: dto.role || 'ADMIN',
      },
    });
  }

  /**
   * 获取管理员列表
   */
  async findAll(query: TenantAdminQueryDto): Promise<{
    data: TenantAdminResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { tenantId, search, role, isActive, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.TenantAdminWhereInput = {};

    if (tenantId) {
      where.tenantId = tenantId;
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [data, total] = await Promise.all([
      this.prisma.tenantAdmin.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      }),
      this.prisma.tenantAdmin.count({ where }),
    ]);

    return {
      data: data.map((admin) => this.mapToResponseDto(admin)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 获取单个管理员
   */
  async findOne(id: string): Promise<TenantAdminResponseDto> {
    const admin = await this.prisma.tenantAdmin.findUnique({
      where: { id },
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

    if (!admin) {
      throw new NotFoundException(`Tenant admin with ID '${id}' not found`);
    }

    return this.mapToResponseDto(admin);
  }

  /**
   * 获取租户的所有管理员
   */
  async findByTenant(tenantId: string): Promise<TenantAdminResponseDto[]> {
    const admins = await this.prisma.tenantAdmin.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
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

    return admins.map((admin) => this.mapToResponseDto(admin));
  }

  /**
   * 更新管理员
   */
  async update(id: string, dto: UpdateTenantAdminDto): Promise<TenantAdmin> {
    const admin = await this.prisma.tenantAdmin.findUnique({
      where: { id },
    });

    if (!admin) {
      throw new NotFoundException(`Tenant admin with ID '${id}' not found`);
    }

    // 不允许将最后一个 OWNER 降级
    if (admin.role === 'OWNER' && dto.role && dto.role !== 'OWNER') {
      const ownerCount = await this.prisma.tenantAdmin.count({
        where: {
          tenantId: admin.tenantId,
          role: 'OWNER',
          isActive: true,
        },
      });

      if (ownerCount <= 1) {
        throw BusinessException.unprocessable(
          ErrorCodes.TENANT_422_003,
          '无法降级最后一个 Owner 角色',
          { adminId: id },
        );
      }
    }

    return this.prisma.tenantAdmin.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * 修改密码
   */
  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    const admin = await this.prisma.tenantAdmin.findUnique({
      where: { id },
    });

    if (!admin) {
      throw new NotFoundException(`Tenant admin with ID '${id}' not found`);
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.tenantAdmin.update({
      where: { id },
      data: { password: hashedPassword },
    });
  }

  /**
   * 删除管理员
   */
  async remove(id: string): Promise<void> {
    const admin = await this.prisma.tenantAdmin.findUnique({
      where: { id },
    });

    if (!admin) {
      throw new NotFoundException(`Tenant admin with ID '${id}' not found`);
    }

    // 不允许删除最后一个 OWNER
    if (admin.role === 'OWNER') {
      const ownerCount = await this.prisma.tenantAdmin.count({
        where: {
          tenantId: admin.tenantId,
          role: 'OWNER',
        },
      });

      if (ownerCount <= 1) {
        throw BusinessException.unprocessable(
          ErrorCodes.TENANT_422_003,
          '无法删除最后一个 Owner',
          { adminId: id },
        );
      }
    }

    await this.prisma.tenantAdmin.delete({
      where: { id },
    });
  }

  /**
   * 激活管理员
   */
  async activate(id: string): Promise<TenantAdmin> {
    await this.findOne(id);

    return this.prisma.tenantAdmin.update({
      where: { id },
      data: { isActive: true },
    });
  }

  /**
   * 停用管理员
   */
  async deactivate(id: string): Promise<TenantAdmin> {
    const admin = await this.prisma.tenantAdmin.findUnique({
      where: { id },
    });

    if (!admin) {
      throw new NotFoundException(`Tenant admin with ID '${id}' not found`);
    }

    // 不允许停用最后一个活跃的 OWNER
    if (admin.role === 'OWNER') {
      const activeOwnerCount = await this.prisma.tenantAdmin.count({
        where: {
          tenantId: admin.tenantId,
          role: 'OWNER',
          isActive: true,
        },
      });

      if (activeOwnerCount <= 1) {
        throw BusinessException.unprocessable(
          ErrorCodes.TENANT_422_003,
          '无法停用最后一个活跃的 Owner',
          { adminId: id },
        );
      }
    }

    return this.prisma.tenantAdmin.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * 获取管理员统计
   */
  async getStats(tenantId?: string): Promise<{
    total: number;
    active: number;
    inactive: number;
    byRole: Record<TenantRole, number>;
  }> {
    const where: Prisma.TenantAdminWhereInput = tenantId ? { tenantId } : {};

    const [total, active, byRole] = await Promise.all([
      this.prisma.tenantAdmin.count({ where }),
      this.prisma.tenantAdmin.count({ where: { ...where, isActive: true } }),
      this.prisma.tenantAdmin.groupBy({
        by: ['role'],
        where,
        _count: { role: true },
      }),
    ]);

    const roleStats: Record<TenantRole, number> = {
      [TenantRole.OWNER]: 0,
      [TenantRole.ADMIN]: 0,
      [TenantRole.OPERATOR]: 0,
    };

    byRole.forEach((item) => {
      roleStats[item.role as TenantRole] = item._count.role;
    });

    return {
      total,
      active,
      inactive: total - active,
      byRole: roleStats,
    };
  }

  /**
   * 映射到响应 DTO
   */
  private mapToResponseDto(admin: any): TenantAdminResponseDto {
    return {
      id: admin.id,
      tenantId: admin.tenantId,
      email: admin.email,
      name: admin.name,
      role: admin.role as TenantRole,
      isActive: admin.isActive,
      lastLogin: admin.lastLogin ?? undefined,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
      tenant: admin.tenant,
    };
  }
}
