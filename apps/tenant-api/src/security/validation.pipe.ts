/**
 * 增强的全局验证管道
 * 提供更详细的错误消息和安全验证
 */

import {
  ValidationPipe,
  ValidationPipeOptions,
  BadRequestException,
  ValidationError,
} from '@nestjs/common';

/**
 * 验证错误详情
 */
export interface ValidationErrorDetail {
  /** 字段名 */
  field: string;
  /** 错误消息列表 */
  messages: string[];
  /** 接收到的值（脱敏后） */
  value?: string;
  /** 子字段错误（嵌套对象） */
  children?: ValidationErrorDetail[];
}

/**
 * 验证错误响应
 */
export interface ValidationErrorResponse {
  /** 状态码 */
  statusCode: number;
  /** 错误类型 */
  error: string;
  /** 错误摘要 */
  message: string;
  /** 详细错误列表 */
  details: ValidationErrorDetail[];
  /** 时间戳 */
  timestamp: string;
}

/**
 * 默认验证管道配置
 */
export const DEFAULT_VALIDATION_OPTIONS: ValidationPipeOptions = {
  // 启用白名单模式，自动剥离未装饰的属性
  whitelist: true,
  // 启用自动类型转换
  transform: true,
  // 禁止未在 DTO 中定义的属性
  forbidNonWhitelisted: true,
  // 禁止未知的值（防止额外数据注入）
  forbidUnknownValues: true,
  // 验证数组元素
  validateCustomDecorators: true,
  // 转换选项
  transformOptions: {
    enableImplicitConversion: true,
  },
  // 停止在第一个错误（设为 false 以收集所有错误）
  stopAtFirstError: false,
  // 启用详细错误消息（仅在开发环境）
  enableDebugMessages: process.env.NODE_ENV !== 'production',
};

/**
 * 将验证错误转换为详细格式
 */
function formatValidationError(error: ValidationError): ValidationErrorDetail {
  const detail: ValidationErrorDetail = {
    field: error.property,
    messages: error.constraints ? Object.values(error.constraints) : [],
  };

  // 脱敏处理原始值
  if (error.value !== undefined && error.value !== null) {
    const value = String(error.value);
    // 对敏感字段不显示值
    if (!isSensitiveField(error.property)) {
      // 截断过长的值
      detail.value = value.length > 50 ? value.slice(0, 50) + '...' : value;
    }
  }

  // 处理嵌套对象的错误
  if (error.children && error.children.length > 0) {
    detail.children = error.children.map(formatValidationError);
  }

  return detail;
}

/**
 * 检查是否为敏感字段
 */
function isSensitiveField(field: string): boolean {
  const sensitivePatterns = [
    /password/i,
    /secret/i,
    /token/i,
    /key/i,
    /auth/i,
    /credential/i,
    /credit/i,
    /card/i,
    /cvv/i,
    /ssn/i,
    /pin/i,
  ];

  return sensitivePatterns.some((pattern) => pattern.test(field));
}

/**
 * 自定义异常工厂
 */
function createValidationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const details = errors.map(formatValidationError);

  // 生成摘要消息
  const fieldCount = details.length;
  const messageCount = details.reduce(
    (sum, detail) => sum + detail.messages.length,
    0
  );

  const response: ValidationErrorResponse = {
    statusCode: 400,
    error: 'Validation Error',
    message: `验证失败: ${fieldCount} 个字段存在 ${messageCount} 个错误`,
    details,
    timestamp: new Date().toISOString(),
  };

  return new BadRequestException(response);
}

/**
 * 创建增强的验证管道
 *
 * @param options 额外的验证选项
 * @returns 配置好的 ValidationPipe 实例
 */
export function createValidationPipe(
  options: Partial<ValidationPipeOptions> = {}
): ValidationPipe {
  return new ValidationPipe({
    ...DEFAULT_VALIDATION_OPTIONS,
    ...options,
    exceptionFactory: createValidationExceptionFactory,
  });
}

/**
 * 增强的验证管道类
 * 直接扩展 NestJS ValidationPipe
 */
export class EnhancedValidationPipe extends ValidationPipe {
  constructor(options: Partial<ValidationPipeOptions> = {}) {
    super({
      ...DEFAULT_VALIDATION_OPTIONS,
      ...options,
      exceptionFactory: createValidationExceptionFactory,
    });
  }
}

/**
 * 严格验证管道 - 用于高安全性场景
 * 更严格的验证规则，适用于敏感操作
 */
export class StrictValidationPipe extends ValidationPipe {
  constructor(options: Partial<ValidationPipeOptions> = {}) {
    super({
      ...DEFAULT_VALIDATION_OPTIONS,
      ...options,
      // 更严格的选项
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      stopAtFirstError: true, // 严格模式下第一个错误就停止
      exceptionFactory: (errors) => {
        const response: ValidationErrorResponse = {
          statusCode: 400,
          error: 'Strict Validation Error',
          message: '输入验证失败，请检查提交的数据',
          details: errors.map(formatValidationError),
          timestamp: new Date().toISOString(),
        };

        return new BadRequestException(response);
      },
    });
  }
}
