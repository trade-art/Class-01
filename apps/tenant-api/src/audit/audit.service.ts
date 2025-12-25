/**
 * 审计服务
 * 提供审计日志查询和统计功能
 */

import { Injectable } from '@nestjs/common';
import {
  AuditLoggerService,
  QueryAuditLogOptions,
  AuditLogEntry,
  AuditLogStats,
} from '../security/audit-logger.service';

/**
 * 审计日志查询 DTO
 */
export interface QueryAuditLogsDto {
  /** 用户 ID */
  userId?: string;
  /** 操作类型 */
  action?: string;
  /** 资源类型 */
  resource?: string;
  /** 资源 ID */
  resourceId?: string;
  /** 状态 */
  status?: string;
  /** 开始时间 (ISO 8601) */
  startDate?: string;
  /** 结束时间 (ISO 8601) */
  endDate?: string;
  /** 搜索关键词 */
  search?: string;
  /** 页码 */
  page?: number;
  /** 每页数量 */
  pageSize?: number;
  /** 排序字段 */
  sortBy?: 'createdAt' | 'action' | 'resource';
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
}

/**
 * 审计日志分页响应
 */
export interface PaginatedAuditLogsResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

@Injectable()
export class AuditService {
  constructor(private readonly auditLogger: AuditLoggerService) {}

  /**
   * 查询审计日志（租户级别）
   * @param tenantId 租户 ID
   * @param query 查询参数
   */
  async queryLogs(
    tenantId: string,
    query: QueryAuditLogsDto,
  ): Promise<PaginatedAuditLogsResponse> {
    const options: QueryAuditLogOptions = {
      tenantId,
      userId: query.userId,
      action: query.action as any,
      resource: query.resource,
      resourceId: query.resourceId,
      status: query.status as any,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      search: query.search,
      page: query.page || 1,
      pageSize: Math.min(query.pageSize || 50, 100), // 最大 100 条
      sortBy: query.sortBy || 'createdAt',
      sortOrder: query.sortOrder || 'desc',
    };

    const { entries, total } = await this.auditLogger.query(options);
    const pageSize = options.pageSize || 50;
    const page = options.page || 1;

    return {
      items: entries,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取审计日志统计（租户级别）
   * @param tenantId 租户 ID
   * @param startDate 开始时间
   * @param endDate 结束时间
   */
  async getStats(
    tenantId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<AuditLogStats> {
    return this.auditLogger.getStats(
      tenantId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  /**
   * 获取用户最近的审计日志
   * @param userId 用户 ID
   * @param limit 数量限制
   */
  async getRecentByUser(userId: string, limit: number = 10): Promise<AuditLogEntry[]> {
    return this.auditLogger.getRecentByUser(userId, limit);
  }

  /**
   * 获取单条审计日志详情
   * @param tenantId 租户 ID
   * @param id 日志 ID
   */
  async getById(tenantId: string, id: string): Promise<AuditLogEntry | null> {
    const { entries } = await this.auditLogger.query({
      tenantId,
      page: 1,
      pageSize: 1,
    });

    // 需要从查询结果中过滤
    const entry = entries.find((e) => e.id === id);
    return entry || null;
  }

  /**
   * 获取操作类型分布（用于图表）
   * @param tenantId 租户 ID
   * @param startDate 开始时间
   * @param endDate 结束时间
   */
  async getActionDistribution(
    tenantId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<Record<string, number>> {
    const stats = await this.getStats(tenantId, startDate, endDate);
    return stats.actionCounts;
  }

  /**
   * 获取资源类型分布（用于图表）
   * @param tenantId 租户 ID
   * @param startDate 开始时间
   * @param endDate 结束时间
   */
  async getResourceDistribution(
    tenantId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<Record<string, number>> {
    const stats = await this.getStats(tenantId, startDate, endDate);
    return stats.resourceCounts;
  }
}
