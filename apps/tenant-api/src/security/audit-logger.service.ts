/**
 * 审计日志服务
 * 记录系统中的安全相关事件，支持查询和分析
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditStatus } from '@prisma/client';

/**
 * 审计日志创建选项
 */
export interface CreateAuditLogOptions {
  /** 租户 ID（null 表示平台级别） */
  tenantId?: string | null;
  /** 操作用户 ID */
  userId?: string | null;
  /** 操作用户邮箱 */
  userEmail?: string | null;
  /** 操作用户角色 */
  userRole?: string | null;
  /** 操作类型 */
  action: AuditAction;
  /** 资源类型 */
  resource: string;
  /** 资源 ID */
  resourceId?: string | null;
  /** 描述 */
  description?: string | null;
  /** IP 地址 */
  ipAddress?: string | null;
  /** User Agent */
  userAgent?: string | null;
  /** 请求 ID（用于追踪） */
  requestId?: string | null;
  /** 变更前的值 */
  oldValue?: Record<string, any> | null;
  /** 变更后的值 */
  newValue?: Record<string, any> | null;
  /** 状态 */
  status?: AuditStatus;
  /** 错误信息 */
  errorMsg?: string | null;
  /** 额外元数据 */
  metadata?: Record<string, any> | null;
}

/**
 * 审计日志查询选项
 */
export interface QueryAuditLogOptions {
  /** 租户 ID */
  tenantId?: string;
  /** 用户 ID */
  userId?: string;
  /** 操作类型 */
  action?: AuditAction;
  /** 资源类型 */
  resource?: string;
  /** 资源 ID */
  resourceId?: string;
  /** 状态 */
  status?: AuditStatus;
  /** 开始时间 */
  startDate?: Date;
  /** 结束时间 */
  endDate?: Date;
  /** 搜索关键词（在描述中搜索） */
  search?: string;
  /** 分页 - 页码 */
  page?: number;
  /** 分页 - 每页数量 */
  pageSize?: number;
  /** 排序字段 */
  sortBy?: 'createdAt' | 'action' | 'resource';
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
}

/**
 * 审计日志条目
 */
export interface AuditLogEntry {
  id: string;
  tenantId: string | null;
  userId: string | null;
  userEmail: string | null;
  userRole: string | null;
  action: AuditAction;
  resource: string;
  resourceId: string | null;
  description: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  oldValue: Record<string, any> | null;
  newValue: Record<string, any> | null;
  status: AuditStatus;
  errorMsg: string | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
}

/**
 * 审计日志统计
 */
export interface AuditLogStats {
  totalCount: number;
  successCount: number;
  failureCount: number;
  actionCounts: Record<string, number>;
  resourceCounts: Record<string, number>;
}

// 重新导出枚举供外部使用
export { AuditAction, AuditStatus };

@Injectable()
export class AuditLoggerService {
  private readonly logger = new Logger(AuditLoggerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 记录审计日志
   */
  async log(options: CreateAuditLogOptions): Promise<AuditLogEntry> {
    try {
      const entry = await this.prisma.auditLog.create({
        data: {
          tenantId: options.tenantId ?? null,
          userId: options.userId ?? null,
          userEmail: options.userEmail ?? null,
          userRole: options.userRole ?? null,
          action: options.action,
          resource: options.resource,
          resourceId: options.resourceId ?? null,
          description: options.description ?? null,
          ipAddress: options.ipAddress ?? null,
          userAgent: options.userAgent ?? null,
          requestId: options.requestId ?? null,
          oldValue: options.oldValue ?? undefined,
          newValue: options.newValue ?? undefined,
          status: options.status ?? AuditStatus.SUCCESS,
          errorMsg: options.errorMsg ?? null,
          metadata: options.metadata ?? undefined,
        },
      });

      // 同时输出到日志
      this.logToConsole(entry);

      return this.toAuditLogEntry(entry);
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${error}`);
      throw error;
    }
  }

  /**
   * 记录成功操作
   */
  async logSuccess(
    action: AuditAction,
    resource: string,
    options: Partial<CreateAuditLogOptions> = {},
  ): Promise<AuditLogEntry> {
    return this.log({
      ...options,
      action,
      resource,
      status: AuditStatus.SUCCESS,
    });
  }

  /**
   * 记录失败操作
   */
  async logFailure(
    action: AuditAction,
    resource: string,
    errorMsg: string,
    options: Partial<CreateAuditLogOptions> = {},
  ): Promise<AuditLogEntry> {
    return this.log({
      ...options,
      action,
      resource,
      status: AuditStatus.FAILURE,
      errorMsg,
    });
  }

  /**
   * 记录登录成功
   */
  async logLoginSuccess(
    userId: string,
    userEmail: string,
    tenantId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuditLogEntry> {
    return this.log({
      action: AuditAction.LOGIN,
      resource: 'auth',
      userId,
      userEmail,
      tenantId,
      ipAddress,
      userAgent,
      description: `User ${userEmail} logged in successfully`,
      status: AuditStatus.SUCCESS,
    });
  }

  /**
   * 记录登录失败
   */
  async logLoginFailure(
    email: string,
    reason: string,
    ipAddress?: string,
    userAgent?: string,
    tenantId?: string,
  ): Promise<AuditLogEntry> {
    return this.log({
      action: AuditAction.LOGIN_FAILED,
      resource: 'auth',
      userEmail: email,
      tenantId,
      ipAddress,
      userAgent,
      description: `Login failed for ${email}: ${reason}`,
      status: AuditStatus.FAILURE,
      errorMsg: reason,
    });
  }

  /**
   * 记录登出
   */
  async logLogout(
    userId: string,
    userEmail: string,
    tenantId: string,
    ipAddress?: string,
  ): Promise<AuditLogEntry> {
    return this.log({
      action: AuditAction.LOGOUT,
      resource: 'auth',
      userId,
      userEmail,
      tenantId,
      ipAddress,
      description: `User ${userEmail} logged out`,
      status: AuditStatus.SUCCESS,
    });
  }

  /**
   * 记录密码修改
   */
  async logPasswordChange(
    userId: string,
    userEmail: string,
    tenantId: string,
    ipAddress?: string,
    success: boolean = true,
    errorMsg?: string,
  ): Promise<AuditLogEntry> {
    return this.log({
      action: AuditAction.PASSWORD_CHANGE,
      resource: 'auth',
      userId,
      userEmail,
      tenantId,
      ipAddress,
      description: success
        ? `User ${userEmail} changed password`
        : `Password change failed for ${userEmail}`,
      status: success ? AuditStatus.SUCCESS : AuditStatus.FAILURE,
      errorMsg,
    });
  }

  /**
   * 记录账户锁定
   */
  async logAccountLockout(
    email: string,
    ipAddress: string,
    reason: string,
    tenantId?: string,
  ): Promise<AuditLogEntry> {
    return this.log({
      action: AuditAction.ACCOUNT_LOCKOUT,
      resource: 'auth',
      userEmail: email,
      tenantId,
      ipAddress,
      description: `Account ${email} locked: ${reason}`,
      status: AuditStatus.SUCCESS,
      metadata: { reason },
    });
  }

  /**
   * 查询审计日志
   */
  async query(
    options: QueryAuditLogOptions = {},
  ): Promise<{ entries: AuditLogEntry[]; total: number }> {
    const {
      tenantId,
      userId,
      action,
      resource,
      resourceId,
      status,
      startDate,
      endDate,
      search,
      page = 1,
      pageSize = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = options;

    const where: any = {};

    if (tenantId !== undefined) {
      where.tenantId = tenantId;
    }

    if (userId) {
      where.userId = userId;
    }

    if (action) {
      where.action = action;
    }

    if (resource) {
      where.resource = resource;
    }

    if (resourceId) {
      where.resourceId = resourceId;
    }

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        where.createdAt.lte = endDate;
      }
    }

    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { userEmail: { contains: search, mode: 'insensitive' } },
        { resource: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [entries, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        take: pageSize,
        skip: (page - 1) * pageSize,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      entries: entries.map(this.toAuditLogEntry),
      total,
    };
  }

  /**
   * 获取审计日志统计
   */
  async getStats(
    tenantId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<AuditLogStats> {
    const where: any = {};

    if (tenantId) {
      where.tenantId = tenantId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        where.createdAt.lte = endDate;
      }
    }

    const [totalCount, successCount, failureCount, actionGroups, resourceGroups] =
      await Promise.all([
        this.prisma.auditLog.count({ where }),
        this.prisma.auditLog.count({ where: { ...where, status: AuditStatus.SUCCESS } }),
        this.prisma.auditLog.count({ where: { ...where, status: AuditStatus.FAILURE } }),
        this.prisma.auditLog.groupBy({
          by: ['action'],
          where,
          _count: { action: true },
        }),
        this.prisma.auditLog.groupBy({
          by: ['resource'],
          where,
          _count: { resource: true },
        }),
      ]);

    const actionCounts: Record<string, number> = {};
    for (const group of actionGroups) {
      actionCounts[group.action] = group._count.action;
    }

    const resourceCounts: Record<string, number> = {};
    for (const group of resourceGroups) {
      resourceCounts[group.resource] = group._count.resource;
    }

    return {
      totalCount,
      successCount,
      failureCount,
      actionCounts,
      resourceCounts,
    };
  }

  /**
   * 获取用户最近的审计日志
   */
  async getRecentByUser(
    userId: string,
    limit: number = 10,
  ): Promise<AuditLogEntry[]> {
    const entries = await this.prisma.auditLog.findMany({
      where: { userId },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return entries.map(this.toAuditLogEntry);
  }

  /**
   * 清理过期的审计日志
   * @param retentionDays 保留天数
   */
  async cleanup(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.prisma.auditLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} audit log entries older than ${retentionDays} days`);
    }

    return result.count;
  }

  /**
   * 输出到控制台日志
   */
  private logToConsole(entry: any): void {
    const level = entry.status === AuditStatus.FAILURE ? 'warn' : 'log';
    const message = `[AUDIT] ${entry.action} on ${entry.resource}${entry.resourceId ? `/${entry.resourceId}` : ''} by ${entry.userEmail || 'system'} - ${entry.status}`;

    if (level === 'warn') {
      this.logger.warn(message);
    } else {
      this.logger.log(message);
    }
  }

  /**
   * 转换为 AuditLogEntry
   */
  private toAuditLogEntry(entry: any): AuditLogEntry {
    return {
      id: entry.id,
      tenantId: entry.tenantId,
      userId: entry.userId,
      userEmail: entry.userEmail,
      userRole: entry.userRole,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId,
      description: entry.description,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      requestId: entry.requestId,
      oldValue: entry.oldValue as Record<string, any> | null,
      newValue: entry.newValue as Record<string, any> | null,
      status: entry.status,
      errorMsg: entry.errorMsg,
      metadata: entry.metadata as Record<string, any> | null,
      createdAt: entry.createdAt,
    };
  }
}
