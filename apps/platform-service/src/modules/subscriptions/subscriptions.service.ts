import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SubscriptionPlan,
  BillingCycle,
  UpdateSubscriptionDto,
  SubscriptionStatusDto,
  SubscriptionChangePreviewDto,
  SubscriptionQueryDto,
  PlanConfigDto,
} from './dto/subscription.dto';
import { BusinessException, ErrorCodes } from '../../common/exceptions';
import { Prisma } from '@prisma/client';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 预定义的订阅计划配置
   */
  private readonly planConfigs: Record<SubscriptionPlan, PlanConfigDto> = {
    [SubscriptionPlan.TRIAL]: {
      plan: SubscriptionPlan.TRIAL,
      monthlyPrice: 0,
      quarterlyPrice: 0,
      yearlyPrice: 0,
      maxInstances: 1,
      maxAdmins: 1,
      features: ['单实例', '基础支持', '14天试用'],
    },
    [SubscriptionPlan.BASIC]: {
      plan: SubscriptionPlan.BASIC,
      monthlyPrice: 99,
      quarterlyPrice: 267,  // 10% off
      yearlyPrice: 950,     // 20% off
      maxInstances: 2,
      maxAdmins: 3,
      features: ['2个实例', '邮件支持', '基础报表'],
    },
    [SubscriptionPlan.PROFESSIONAL]: {
      plan: SubscriptionPlan.PROFESSIONAL,
      monthlyPrice: 299,
      quarterlyPrice: 807,  // 10% off
      yearlyPrice: 2870,    // 20% off
      maxInstances: 5,
      maxAdmins: 10,
      features: ['5个实例', '优先支持', '高级报表', 'API 访问'],
    },
    [SubscriptionPlan.ENTERPRISE]: {
      plan: SubscriptionPlan.ENTERPRISE,
      monthlyPrice: 999,
      quarterlyPrice: 2697, // 10% off
      yearlyPrice: 9590,    // 20% off
      maxInstances: 50,
      maxAdmins: 100,
      features: ['无限实例', '24/7 支持', '定制功能', '专属客户经理', 'SLA 保障'],
    },
  };

  /**
   * 获取所有订阅计划配置
   */
  getPlanConfigs(): PlanConfigDto[] {
    return Object.values(this.planConfigs);
  }

  /**
   * 获取指定计划配置
   */
  getPlanConfig(plan: SubscriptionPlan): PlanConfigDto {
    return this.planConfigs[plan];
  }

  /**
   * 获取租户订阅状态
   */
  async getSubscriptionStatus(tenantId: string): Promise<SubscriptionStatusDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: {
          select: {
            instances: true,
            admins: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${tenantId}' not found`);
    }

    const now = new Date();
    const expiresAt = tenant.expiresAt;
    let daysRemaining: number | undefined;
    let isExpiringSoon = false;

    if (expiresAt) {
      daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      isExpiringSoon = daysRemaining <= 30 && daysRemaining > 0;
    }

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      currentPlan: tenant.plan as SubscriptionPlan,
      billingCycle: tenant.billingCycle as BillingCycle,
      instanceQuota: {
        used: tenant._count.instances,
        max: tenant.maxInstances,
        available: Math.max(0, tenant.maxInstances - tenant._count.instances),
      },
      adminQuota: {
        used: tenant._count.admins,
        max: tenant.maxAdmins,
        available: Math.max(0, tenant.maxAdmins - tenant._count.admins),
      },
      expiresAt: expiresAt ?? undefined,
      isExpiringSoon,
      daysRemaining,
    };
  }

  /**
   * 获取所有租户订阅列表
   */
  async listSubscriptions(query: SubscriptionQueryDto): Promise<{
    data: SubscriptionStatusDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { plan, expiringSoon, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.TenantWhereInput = {};

    if (plan) {
      where.plan = plan;
    }

    if (expiringSoon) {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      where.expiresAt = {
        lte: thirtyDaysFromNow,
        gt: new Date(),
      };
    }

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              instances: true,
              admins: true,
            },
          },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    const now = new Date();
    const data = tenants.map((tenant) => {
      const expiresAt = tenant.expiresAt;
      let daysRemaining: number | undefined;
      let isExpiringSoon = false;

      if (expiresAt) {
        daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        isExpiringSoon = daysRemaining <= 30 && daysRemaining > 0;
      }

      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        currentPlan: tenant.plan as SubscriptionPlan,
        billingCycle: tenant.billingCycle as BillingCycle,
        instanceQuota: {
          used: tenant._count.instances,
          max: tenant.maxInstances,
          available: Math.max(0, tenant.maxInstances - tenant._count.instances),
        },
        adminQuota: {
          used: tenant._count.admins,
          max: tenant.maxAdmins,
          available: Math.max(0, tenant.maxAdmins - tenant._count.admins),
        },
        expiresAt: expiresAt ?? undefined,
        isExpiringSoon,
        daysRemaining,
      };
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 预览订阅变更
   */
  async previewSubscriptionChange(
    tenantId: string,
    targetPlan: SubscriptionPlan,
  ): Promise<SubscriptionChangePreviewDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: {
          select: {
            instances: true,
            admins: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${tenantId}' not found`);
    }

    const currentPlan = tenant.plan as SubscriptionPlan;
    const currentConfig = this.planConfigs[currentPlan];
    const targetConfig = this.planConfigs[targetPlan];

    const planOrder = [
      SubscriptionPlan.TRIAL,
      SubscriptionPlan.BASIC,
      SubscriptionPlan.PROFESSIONAL,
      SubscriptionPlan.ENTERPRISE,
    ];
    const isUpgrade = planOrder.indexOf(targetPlan) > planOrder.indexOf(currentPlan);

    // 计算价格差异 (按月计算)
    const priceDifference = targetConfig.monthlyPrice - currentConfig.monthlyPrice;

    // 检查降级是否可行
    const warnings: string[] = [];
    if (!isUpgrade) {
      if (tenant._count.instances > targetConfig.maxInstances) {
        warnings.push(
          `当前使用 ${tenant._count.instances} 个实例，目标计划仅允许 ${targetConfig.maxInstances} 个`,
        );
      }
      if (tenant._count.admins > targetConfig.maxAdmins) {
        warnings.push(
          `当前有 ${tenant._count.admins} 个管理员，目标计划仅允许 ${targetConfig.maxAdmins} 个`,
        );
      }
    }

    return {
      tenantId,
      currentPlan,
      targetPlan,
      isUpgrade,
      priceDifference,
      proratedAmount: isUpgrade ? this.calculateProratedAmount(tenant, targetConfig) : undefined,
      quotaChanges: {
        instances: {
          from: currentConfig.maxInstances,
          to: targetConfig.maxInstances,
        },
        admins: {
          from: currentConfig.maxAdmins,
          to: targetConfig.maxAdmins,
        },
      },
      requiresImmediatePayment: isUpgrade && priceDifference > 0,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * 更新租户订阅
   */
  async updateSubscription(
    tenantId: string,
    dto: UpdateSubscriptionDto,
  ): Promise<SubscriptionStatusDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: {
          select: {
            instances: true,
            admins: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${tenantId}' not found`);
    }

    const targetConfig = this.planConfigs[dto.plan];

    // 验证降级是否可行
    if (tenant._count.instances > (dto.maxInstances ?? targetConfig.maxInstances)) {
      throw BusinessException.unprocessable(
        ErrorCodes.TENANT_422_003,
        `无法降级：当前使用 ${tenant._count.instances} 个实例，超过目标计划上限`,
        { currentInstances: tenant._count.instances, targetMax: dto.maxInstances ?? targetConfig.maxInstances },
      );
    }

    if (tenant._count.admins > (dto.maxAdmins ?? targetConfig.maxAdmins)) {
      throw BusinessException.unprocessable(
        ErrorCodes.TENANT_422_003,
        `无法降级：当前有 ${tenant._count.admins} 个管理员，超过目标计划上限`,
        { currentAdmins: tenant._count.admins, targetMax: dto.maxAdmins ?? targetConfig.maxAdmins },
      );
    }

    // 计算新的到期时间
    const expiresAt = this.calculateExpiryDate(dto.billingCycle);

    // 更新订阅
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        plan: dto.plan,
        billingCycle: dto.billingCycle,
        maxInstances: dto.maxInstances ?? targetConfig.maxInstances,
        maxAdmins: dto.maxAdmins ?? targetConfig.maxAdmins,
        expiresAt,
      },
    });

    return this.getSubscriptionStatus(tenantId);
  }

  /**
   * 续订订阅
   */
  async renewSubscription(tenantId: string): Promise<SubscriptionStatusDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${tenantId}' not found`);
    }

    const newExpiresAt = this.calculateExpiryDate(
      tenant.billingCycle as BillingCycle,
      tenant.expiresAt ?? undefined,
    );

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        expiresAt: newExpiresAt,
        status: 'ACTIVE', // 续订后恢复为激活状态
      },
    });

    return this.getSubscriptionStatus(tenantId);
  }

  /**
   * 获取订阅统计
   */
  async getSubscriptionStats(): Promise<{
    byPlan: Record<SubscriptionPlan, number>;
    expiringSoon: number;
    expired: number;
    totalRevenue: number;
  }> {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const [byPlan, expiringSoon, expired] = await Promise.all([
      this.prisma.tenant.groupBy({
        by: ['plan'],
        _count: { plan: true },
      }),
      this.prisma.tenant.count({
        where: {
          expiresAt: {
            lte: thirtyDaysFromNow,
            gt: now,
          },
          status: 'ACTIVE',
        },
      }),
      this.prisma.tenant.count({
        where: {
          expiresAt: { lt: now },
          status: { not: 'CANCELLED' },
        },
      }),
    ]);

    const planStats: Record<SubscriptionPlan, number> = {
      [SubscriptionPlan.TRIAL]: 0,
      [SubscriptionPlan.BASIC]: 0,
      [SubscriptionPlan.PROFESSIONAL]: 0,
      [SubscriptionPlan.ENTERPRISE]: 0,
    };

    byPlan.forEach((item) => {
      planStats[item.plan as SubscriptionPlan] = item._count.plan;
    });

    // 估算月收入
    let totalRevenue = 0;
    for (const [plan, count] of Object.entries(planStats)) {
      totalRevenue += this.planConfigs[plan as SubscriptionPlan].monthlyPrice * count;
    }

    return {
      byPlan: planStats,
      expiringSoon,
      expired,
      totalRevenue,
    };
  }

  /**
   * 计算按比例的金额
   */
  private calculateProratedAmount(
    tenant: { expiresAt: Date | null; billingCycle: string },
    targetConfig: PlanConfigDto,
  ): number {
    if (!tenant.expiresAt) return targetConfig.monthlyPrice;

    const now = new Date();
    const daysRemaining = Math.max(
      0,
      Math.ceil((tenant.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    );

    let cycleDays: number;
    let cyclePrice: number;
    switch (tenant.billingCycle) {
      case 'MONTHLY':
        cycleDays = 30;
        cyclePrice = targetConfig.monthlyPrice;
        break;
      case 'QUARTERLY':
        cycleDays = 90;
        cyclePrice = targetConfig.quarterlyPrice;
        break;
      case 'YEARLY':
        cycleDays = 365;
        cyclePrice = targetConfig.yearlyPrice;
        break;
      default:
        cycleDays = 30;
        cyclePrice = targetConfig.monthlyPrice;
    }

    return Math.round((cyclePrice / cycleDays) * daysRemaining * 100) / 100;
  }

  /**
   * 计算到期日期
   */
  private calculateExpiryDate(billingCycle: BillingCycle, fromDate?: Date): Date {
    const startDate = fromDate ?? new Date();
    const expiresAt = new Date(startDate);

    switch (billingCycle) {
      case BillingCycle.MONTHLY:
        expiresAt.setMonth(expiresAt.getMonth() + 1);
        break;
      case BillingCycle.QUARTERLY:
        expiresAt.setMonth(expiresAt.getMonth() + 3);
        break;
      case BillingCycle.YEARLY:
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        break;
    }

    return expiresAt;
  }
}
