import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  RiskAlertQueryDto,
  RiskAlertDto,
  RiskAlertListResponseDto,
  RiskConfigDto,
  UpdateRiskConfigDto,
  RiskAlertType,
  RiskAlertLevel,
  RiskStatsDto,
} from './dto';

/**
 * 风控服务
 * 提供风控预警和配置管理功能
 */
@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取预警列表
   */
  async getAlerts(
    tenantId: string,
    query: RiskAlertQueryDto,
  ): Promise<RiskAlertListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.RiskAlertWhereInput = {
      tenantId,
    };

    // 添加过滤条件
    if (query.type) {
      where.type = query.type;
    }
    if (query.level) {
      where.level = query.level;
    }
    if (query.isRead !== undefined) {
      where.isRead = query.isRead;
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        where.createdAt.gte = new Date(query.from);
      }
      if (query.to) {
        where.createdAt.lte = new Date(query.to);
      }
    }

    const [alerts, total] = await Promise.all([
      this.prisma.riskAlert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.riskAlert.count({ where }),
    ]);

    return {
      alerts: alerts.map((alert) => this.mapToAlertDto(alert)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 获取风控统计
   */
  async getStats(tenantId: string): Promise<RiskStatsDto> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayAlerts, unreadCount, levelCounts] = await Promise.all([
      this.prisma.riskAlert.count({
        where: {
          tenantId,
          createdAt: { gte: today },
        },
      }),
      this.prisma.riskAlert.count({
        where: {
          tenantId,
          isRead: false,
        },
      }),
      this.prisma.riskAlert.groupBy({
        by: ['level'],
        where: {
          tenantId,
          isRead: false,
        },
        _count: { level: true },
      }),
    ]);

    const levelCountMap = levelCounts.reduce(
      (acc, item) => {
        acc[item.level] = item._count.level;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      todayTotal: todayAlerts,
      unreadCount,
      criticalCount: levelCountMap['CRITICAL'] ?? 0,
      warningCount: levelCountMap['WARNING'] ?? 0,
      infoCount: levelCountMap['INFO'] ?? 0,
    };
  }

  /**
   * 标记预警为已读
   */
  async markAsRead(tenantId: string, alertIds: string[]): Promise<void> {
    await this.prisma.riskAlert.updateMany({
      where: {
        tenantId,
        id: { in: alertIds },
      },
      data: { isRead: true },
    });

    this.logger.log(`标记 ${alertIds.length} 条预警为已读`);
  }

  /**
   * 标记所有预警为已读
   */
  async markAllAsRead(tenantId: string): Promise<void> {
    await this.prisma.riskAlert.updateMany({
      where: {
        tenantId,
        isRead: false,
      },
      data: { isRead: true },
    });

    this.logger.log(`标记租户 ${tenantId} 所有预警为已读`);
  }

  /**
   * 获取风控配置
   */
  async getConfig(tenantId: string): Promise<RiskConfigDto> {
    let config = await this.prisma.riskConfig.findUnique({
      where: { tenantId },
    });

    // 如果没有配置，创建默认配置
    if (!config) {
      config = await this.prisma.riskConfig.create({
        data: {
          tenantId,
          largeTradeThreshold: new Prisma.Decimal(100000),
          lowMarginThreshold: new Prisma.Decimal(50),
          highFrequencyLimit: 100,
          isEnabled: true,
        },
      });
    }

    return {
      largeTradeThreshold: Number(config.largeTradeThreshold),
      lowMarginThreshold: Number(config.lowMarginThreshold),
      highFrequencyLimit: config.highFrequencyLimit,
      isEnabled: config.isEnabled,
    };
  }

  /**
   * 更新风控配置
   */
  async updateConfig(
    tenantId: string,
    dto: UpdateRiskConfigDto,
  ): Promise<RiskConfigDto> {
    const updateData: Prisma.RiskConfigUpdateInput = {};

    if (dto.largeTradeThreshold !== undefined) {
      updateData.largeTradeThreshold = new Prisma.Decimal(
        dto.largeTradeThreshold,
      );
    }
    if (dto.lowMarginThreshold !== undefined) {
      updateData.lowMarginThreshold = new Prisma.Decimal(dto.lowMarginThreshold);
    }
    if (dto.highFrequencyLimit !== undefined) {
      updateData.highFrequencyLimit = dto.highFrequencyLimit;
    }
    if (dto.isEnabled !== undefined) {
      updateData.isEnabled = dto.isEnabled;
    }

    const config = await this.prisma.riskConfig.upsert({
      where: { tenantId },
      update: updateData,
      create: {
        tenantId,
        largeTradeThreshold: new Prisma.Decimal(
          dto.largeTradeThreshold ?? 100000,
        ),
        lowMarginThreshold: new Prisma.Decimal(dto.lowMarginThreshold ?? 50),
        highFrequencyLimit: dto.highFrequencyLimit ?? 100,
        isEnabled: dto.isEnabled ?? true,
      },
    });

    this.logger.log(`更新租户 ${tenantId} 风控配置`);

    return {
      largeTradeThreshold: Number(config.largeTradeThreshold),
      lowMarginThreshold: Number(config.lowMarginThreshold),
      highFrequencyLimit: config.highFrequencyLimit,
      isEnabled: config.isEnabled,
    };
  }

  /**
   * 创建预警 (内部调用)
   */
  async createAlert(
    tenantId: string,
    type: RiskAlertType,
    level: RiskAlertLevel,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<RiskAlertDto> {
    const alert = await this.prisma.riskAlert.create({
      data: {
        tenantId,
        type,
        level,
        message,
        data: data ? (data as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    this.logger.log(
      `创建预警: [${level}] ${type} - ${message} (租户: ${tenantId})`,
    );

    return this.mapToAlertDto(alert);
  }

  /**
   * 删除预警
   */
  async deleteAlert(tenantId: string, alertId: string): Promise<void> {
    await this.prisma.riskAlert.deleteMany({
      where: {
        id: alertId,
        tenantId,
      },
    });

    this.logger.log(`删除预警 ${alertId}`);
  }

  /**
   * 清理旧预警 (可用于定时任务)
   */
  async cleanupOldAlerts(tenantId: string, daysToKeep: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.prisma.riskAlert.deleteMany({
      where: {
        tenantId,
        createdAt: { lt: cutoffDate },
        isRead: true,
      },
    });

    this.logger.log(`清理 ${result.count} 条旧预警 (租户: ${tenantId})`);

    return result.count;
  }

  /**
   * 映射为预警 DTO
   */
  private mapToAlertDto(alert: {
    id: string;
    type: string;
    level: string;
    message: string;
    data: Prisma.JsonValue;
    isRead: boolean;
    createdAt: Date;
  }): RiskAlertDto {
    return {
      id: alert.id,
      type: alert.type as RiskAlertType,
      level: alert.level as RiskAlertLevel,
      message: alert.message,
      data: alert.data as Record<string, unknown> | undefined,
      isRead: alert.isRead,
      createdAt: alert.createdAt.toISOString(),
    };
  }
}
