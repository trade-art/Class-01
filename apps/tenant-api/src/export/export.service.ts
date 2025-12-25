/**
 * 安全数据导出服务
 * 提供带权限检查、审计日志和可选加密的数据导出功能
 */

import { Injectable, Logger, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuditLoggerService,
  AuditAction,
  DataSanitizerService,
  EncryptionService,
} from '../security';

/**
 * 导出格式
 */
export enum ExportFormat {
  JSON = 'json',
  CSV = 'csv',
}

/**
 * 导出类型
 */
export enum ExportType {
  /** 用户列表 */
  USERS = 'users',
  /** 审计日志 */
  AUDIT_LOGS = 'audit_logs',
  /** 交易记录 */
  TRADES = 'trades',
  /** 持仓记录 */
  POSITIONS = 'positions',
}

/**
 * 导出请求选项
 */
export interface ExportOptions {
  /** 导出类型 */
  type: ExportType;
  /** 导出格式 */
  format: ExportFormat;
  /** 是否加密导出文件 */
  encrypt?: boolean;
  /** 加密密码（用于加密导出） */
  encryptionPassword?: string;
  /** 开始日期 */
  startDate?: Date;
  /** 结束日期 */
  endDate?: Date;
  /** 过滤条件 */
  filters?: Record<string, any>;
  /** 是否脱敏敏感数据 */
  sanitize?: boolean;
  /** 最大记录数 */
  limit?: number;
}

/**
 * 导出结果
 */
export interface ExportResult {
  /** 文件名 */
  filename: string;
  /** 文件内容（Buffer 或 string） */
  content: Buffer | string;
  /** MIME 类型 */
  mimeType: string;
  /** 记录数 */
  recordCount: number;
  /** 是否已加密 */
  encrypted: boolean;
  /** 导出时间 */
  exportedAt: Date;
}

/**
 * 导出权限
 */
export interface ExportPermission {
  type: ExportType;
  allowedRoles: string[];
  maxRecords: number;
  requiresEncryption: boolean;
}

/**
 * 默认导出权限配置
 */
const DEFAULT_EXPORT_PERMISSIONS: ExportPermission[] = [
  {
    type: ExportType.USERS,
    allowedRoles: ['owner', 'admin'],
    maxRecords: 10000,
    requiresEncryption: true,
  },
  {
    type: ExportType.AUDIT_LOGS,
    allowedRoles: ['owner', 'admin'],
    maxRecords: 50000,
    requiresEncryption: false,
  },
  {
    type: ExportType.TRADES,
    allowedRoles: ['owner', 'admin', 'operator'],
    maxRecords: 100000,
    requiresEncryption: false,
  },
  {
    type: ExportType.POSITIONS,
    allowedRoles: ['owner', 'admin', 'operator'],
    maxRecords: 50000,
    requiresEncryption: false,
  },
];

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);
  private readonly exportPermissions: Map<ExportType, ExportPermission>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogger: AuditLoggerService,
    private readonly dataSanitizer: DataSanitizerService,
    private readonly encryptionService: EncryptionService,
  ) {
    // 初始化权限配置
    this.exportPermissions = new Map(
      DEFAULT_EXPORT_PERMISSIONS.map((p) => [p.type, p]),
    );
  }

  /**
   * 检查导出权限
   */
  async checkExportPermission(
    tenantId: string,
    userId: string,
    userRole: string,
    exportType: ExportType,
  ): Promise<void> {
    const permission = this.exportPermissions.get(exportType);

    if (!permission) {
      throw new BadRequestException(`不支持的导出类型: ${exportType}`);
    }

    if (!permission.allowedRoles.includes(userRole.toLowerCase())) {
      // 记录权限拒绝审计
      await this.auditLogger.log({
        tenantId,
        userId,
        action: AuditAction.DATA_EXPORT,
        resource: 'export',
        description: `导出权限拒绝: ${exportType}`,
        status: 'FAILURE',
        errorMsg: `角色 ${userRole} 无权导出 ${exportType}`,
      });

      throw new ForbiddenException(`您没有导出 ${exportType} 的权限`);
    }
  }

  /**
   * 导出数据
   */
  async exportData(
    tenantId: string,
    userId: string,
    userEmail: string,
    userRole: string,
    options: ExportOptions,
    ipAddress?: string,
  ): Promise<ExportResult> {
    // 检查权限
    await this.checkExportPermission(tenantId, userId, userRole, options.type);

    const permission = this.exportPermissions.get(options.type)!;

    // 检查是否需要强制加密
    if (permission.requiresEncryption && !options.encrypt) {
      throw new BadRequestException(`导出 ${options.type} 必须使用加密`);
    }

    // 限制记录数
    const limit = Math.min(options.limit || permission.maxRecords, permission.maxRecords);

    try {
      // 获取数据
      const data = await this.fetchExportData(tenantId, options.type, {
        startDate: options.startDate,
        endDate: options.endDate,
        filters: options.filters,
        limit,
      });

      // 脱敏处理
      const processedData = options.sanitize !== false
        ? data.map((item) => this.dataSanitizer.sanitizeObject(item))
        : data;

      // 转换格式
      let content: string | Buffer;
      let mimeType: string;

      if (options.format === ExportFormat.CSV) {
        content = this.convertToCSV(processedData);
        mimeType = 'text/csv';
      } else {
        content = JSON.stringify(processedData, null, 2);
        mimeType = 'application/json';
      }

      // 加密处理
      let encrypted = false;
      if (options.encrypt && options.encryptionPassword) {
        content = this.encryptContent(content, options.encryptionPassword);
        encrypted = true;
        mimeType = 'application/octet-stream';
      }

      // 生成文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const ext = encrypted ? 'enc' : (options.format === ExportFormat.CSV ? 'csv' : 'json');
      const filename = `export-${options.type}-${timestamp}.${ext}`;

      // 记录审计日志
      await this.auditLogger.log({
        tenantId,
        userId,
        userEmail,
        action: AuditAction.DATA_EXPORT,
        resource: 'export',
        description: `导出 ${options.type} 数据，${processedData.length} 条记录`,
        ipAddress,
        status: 'SUCCESS',
        metadata: {
          exportType: options.type,
          format: options.format,
          recordCount: processedData.length,
          encrypted,
          sanitized: options.sanitize !== false,
        },
      });

      this.logger.log(
        `数据导出成功: ${options.type}, 用户: ${userEmail}, 记录数: ${processedData.length}`,
      );

      return {
        filename,
        content: Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'),
        mimeType,
        recordCount: processedData.length,
        encrypted,
        exportedAt: new Date(),
      };
    } catch (error) {
      // 记录失败审计
      await this.auditLogger.log({
        tenantId,
        userId,
        userEmail,
        action: AuditAction.DATA_EXPORT,
        resource: 'export',
        description: `导出 ${options.type} 失败`,
        ipAddress,
        status: 'FAILURE',
        errorMsg: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * 获取导出数据
   */
  private async fetchExportData(
    tenantId: string,
    type: ExportType,
    options: {
      startDate?: Date;
      endDate?: Date;
      filters?: Record<string, any>;
      limit: number;
    },
  ): Promise<Record<string, any>[]> {
    const { startDate, endDate, filters, limit } = options;

    // 基础过滤条件
    const baseWhere: any = {};
    if (startDate || endDate) {
      baseWhere.createdAt = {};
      if (startDate) baseWhere.createdAt.gte = startDate;
      if (endDate) baseWhere.createdAt.lte = endDate;
    }

    switch (type) {
      case ExportType.USERS:
        return this.prisma.tenantAdmin.findMany({
          where: { tenantId, ...filters },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            createdAt: true,
            lastLogin: true,
          },
          take: limit,
          orderBy: { createdAt: 'desc' },
        });

      case ExportType.AUDIT_LOGS:
        return this.prisma.auditLog.findMany({
          where: { tenantId, ...baseWhere, ...filters },
          take: limit,
          orderBy: { createdAt: 'desc' },
        });

      case ExportType.TRADES:
        // 交易记录导出 - 需要根据实际模型调整
        return [];

      case ExportType.POSITIONS:
        // 持仓记录导出 - 需要根据实际模型调整
        return [];

      default:
        throw new BadRequestException(`不支持的导出类型: ${type}`);
    }
  }

  /**
   * 转换为 CSV 格式
   */
  private convertToCSV(data: Record<string, any>[]): string {
    if (data.length === 0) {
      return '';
    }

    // 获取所有键
    const keys = Object.keys(data[0]);

    // 生成标题行
    const header = keys.map((key) => this.escapeCSV(key)).join(',');

    // 生成数据行
    const rows = data.map((item) =>
      keys
        .map((key) => {
          const value = item[key];
          if (value === null || value === undefined) {
            return '';
          }
          if (typeof value === 'object') {
            return this.escapeCSV(JSON.stringify(value));
          }
          return this.escapeCSV(String(value));
        })
        .join(','),
    );

    return [header, ...rows].join('\n');
  }

  /**
   * 转义 CSV 值
   */
  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * 加密内容
   */
  private encryptContent(content: string | Buffer, password: string): Buffer {
    const contentBuffer = Buffer.isBuffer(content)
      ? content
      : Buffer.from(content, 'utf8');

    // 使用加密服务进行加密
    const encrypted = this.encryptionService.encrypt(contentBuffer, {
      associatedData: 'export-file',
    });

    // 序列化加密结果
    return Buffer.from(JSON.stringify(encrypted), 'utf8');
  }

  /**
   * 获取可用的导出类型
   */
  getAvailableExportTypes(userRole: string): ExportType[] {
    const types: ExportType[] = [];

    for (const [type, permission] of this.exportPermissions) {
      if (permission.allowedRoles.includes(userRole.toLowerCase())) {
        types.push(type);
      }
    }

    return types;
  }

  /**
   * 获取导出权限信息
   */
  getExportPermission(type: ExportType): ExportPermission | undefined {
    return this.exportPermissions.get(type);
  }
}
