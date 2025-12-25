/**
 * 审计装饰器
 * 用于标记需要审计的敏感操作
 */

import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '@prisma/client';

/**
 * 审计元数据键
 */
export const AUDIT_METADATA_KEY = 'audit_metadata';

/**
 * 审计配置选项
 */
export interface AuditOptions {
  /** 操作类型 */
  action: AuditAction;
  /** 资源类型 */
  resource: string;
  /** 描述模板（支持占位符：{param.xxx}, {body.xxx}, {result.xxx}） */
  description?: string;
  /** 是否记录请求体中的变更前值（从 body.id 获取实体） */
  captureOldValue?: boolean;
  /** 是否记录变更后的值 */
  captureNewValue?: boolean;
  /** 敏感字段（这些字段在日志中会被脱敏） */
  sensitiveFields?: string[];
  /** 额外元数据提取器 */
  metadataExtractor?: (context: any) => Record<string, any>;
}

/**
 * 审计装饰器
 * 标记方法需要记录审计日志
 *
 * @example
 * ```typescript
 * @Audit({
 *   action: AuditAction.USER_UPDATE,
 *   resource: 'user',
 *   description: '更新用户 {param.id}',
 *   captureOldValue: true,
 *   captureNewValue: true,
 *   sensitiveFields: ['password', 'email'],
 * })
 * async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {}
 * ```
 */
export const Audit = (options: AuditOptions) =>
  SetMetadata(AUDIT_METADATA_KEY, options);

/**
 * 跳过审计装饰器
 * 用于在全局启用审计的情况下跳过特定方法
 */
export const SKIP_AUDIT_KEY = 'skip_audit';
export const SkipAudit = () => SetMetadata(SKIP_AUDIT_KEY, true);

/**
 * 预定义的审计配置
 */
export const AuditPresets = {
  /** 用户创建 */
  createUser: (resource: string = 'user'): AuditOptions => ({
    action: AuditAction.USER_CREATE,
    resource,
    description: '创建用户',
    captureNewValue: true,
    sensitiveFields: ['password'],
  }),

  /** 用户更新 */
  updateUser: (resource: string = 'user'): AuditOptions => ({
    action: AuditAction.USER_UPDATE,
    resource,
    description: '更新用户 {param.id}',
    captureOldValue: true,
    captureNewValue: true,
    sensitiveFields: ['password'],
  }),

  /** 用户删除 */
  deleteUser: (resource: string = 'user'): AuditOptions => ({
    action: AuditAction.USER_DELETE,
    resource,
    description: '删除用户 {param.id}',
    captureOldValue: true,
  }),

  /** 权限变更 */
  permissionChange: (resource: string = 'permission'): AuditOptions => ({
    action: AuditAction.PERMISSION_CHANGE,
    resource,
    description: '变更权限',
    captureOldValue: true,
    captureNewValue: true,
  }),

  /** 配置变更 */
  configChange: (resource: string = 'config'): AuditOptions => ({
    action: AuditAction.CONFIG_UPDATE,
    resource,
    description: '更新配置',
    captureOldValue: true,
    captureNewValue: true,
  }),

  /** 数据导出 */
  dataExport: (resource: string = 'export'): AuditOptions => ({
    action: AuditAction.DATA_EXPORT,
    resource,
    description: '导出数据',
  }),

  /** 数据导入 */
  dataImport: (resource: string = 'import'): AuditOptions => ({
    action: AuditAction.DATA_IMPORT,
    resource,
    description: '导入数据',
    captureNewValue: true,
  }),
};
