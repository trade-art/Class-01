/**
 * 数据脱敏服务
 * 自动检测和脱敏敏感数据
 */

import { Injectable, Logger } from '@nestjs/common';

/**
 * 脱敏模式
 */
export enum SanitizeMode {
  /** 完全隐藏：****** */
  FULL = 'full',
  /** 部分隐藏：abc***xyz */
  PARTIAL = 'partial',
  /** 哈希替换：[HASH:a1b2c3] */
  HASH = 'hash',
  /** 类型替换：[EMAIL] */
  TYPE = 'type',
  /** 保留格式：***-**-1234 (SSN) */
  FORMAT = 'format',
}

/**
 * 敏感字段配置
 */
export interface SensitiveFieldConfig {
  /** 字段名模式（正则表达式） */
  pattern: RegExp;
  /** 脱敏模式 */
  mode: SanitizeMode;
  /** 自定义脱敏函数 */
  customSanitizer?: (value: any) => any;
}

/**
 * 脱敏选项
 */
export interface SanitizeOptions {
  /** 脱敏模式 */
  mode?: SanitizeMode;
  /** 额外的敏感字段 */
  additionalFields?: string[];
  /** 排除的字段 */
  excludeFields?: string[];
  /** 是否递归处理嵌套对象 */
  recursive?: boolean;
  /** 最大递归深度 */
  maxDepth?: number;
}

/**
 * 默认敏感字段配置
 */
const DEFAULT_SENSITIVE_FIELDS: SensitiveFieldConfig[] = [
  // 认证相关
  { pattern: /^password$/i, mode: SanitizeMode.FULL },
  { pattern: /^(current|new|confirm)_?password$/i, mode: SanitizeMode.FULL },
  { pattern: /^(access|refresh|auth)_?token$/i, mode: SanitizeMode.PARTIAL },
  { pattern: /^(api|secret)_?key$/i, mode: SanitizeMode.PARTIAL },
  { pattern: /^(private|secret)_?key$/i, mode: SanitizeMode.FULL },

  // 个人信息
  { pattern: /^(ssn|social_?security)$/i, mode: SanitizeMode.FORMAT },
  { pattern: /^(credit_?card|card_?number)$/i, mode: SanitizeMode.FORMAT },
  { pattern: /^(cvv|cvc|security_?code)$/i, mode: SanitizeMode.FULL },
  { pattern: /^(id_?card|passport)(_?number)?$/i, mode: SanitizeMode.PARTIAL },
  { pattern: /^(bank_?account|iban|swift)$/i, mode: SanitizeMode.PARTIAL },

  // 联系信息
  { pattern: /^(phone|mobile|tel)(_?number)?$/i, mode: SanitizeMode.PARTIAL },
  { pattern: /^email$/i, mode: SanitizeMode.PARTIAL },

  // 地址信息
  { pattern: /^(address|street|home_?address)$/i, mode: SanitizeMode.PARTIAL },

  // 其他敏感数据
  { pattern: /^(pin|otp|verification_?code)$/i, mode: SanitizeMode.FULL },
  { pattern: /^(cookie|session)(_?id)?$/i, mode: SanitizeMode.PARTIAL },
  { pattern: /^(bearer|authorization)$/i, mode: SanitizeMode.PARTIAL },
];

/**
 * 敏感值模式检测
 */
const SENSITIVE_VALUE_PATTERNS = [
  // JWT Token
  { pattern: /^eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/, type: 'JWT' },
  // 邮箱
  { pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, type: 'EMAIL' },
  // 信用卡号 (Visa, MasterCard, etc.)
  { pattern: /^[0-9]{13,19}$/, type: 'CARD', validator: (v: string) => isLuhnValid(v) },
  // IP 地址
  { pattern: /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/, type: 'IP' },
  // UUID
  { pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, type: 'UUID' },
];

/**
 * Luhn 算法验证（信用卡号验证）
 */
function isLuhnValid(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 13) return false;

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

@Injectable()
export class DataSanitizerService {
  private readonly logger = new Logger(DataSanitizerService.name);
  private sensitiveFields: SensitiveFieldConfig[] = [...DEFAULT_SENSITIVE_FIELDS];

  /**
   * 添加自定义敏感字段配置
   */
  addSensitiveField(config: SensitiveFieldConfig): void {
    this.sensitiveFields.push(config);
  }

  /**
   * 脱敏单个值
   * @param value 原始值
   * @param fieldName 字段名（可选）
   * @param options 脱敏选项
   */
  sanitizeValue(
    value: any,
    fieldName?: string,
    options: SanitizeOptions = {},
  ): any {
    if (value === null || value === undefined) {
      return value;
    }

    // 检查是否在排除列表中
    if (fieldName && options.excludeFields?.includes(fieldName)) {
      return value;
    }

    // 字符串处理
    if (typeof value === 'string') {
      return this.sanitizeString(value, fieldName, options);
    }

    // 数组处理
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue(item, fieldName, options));
    }

    // 对象处理
    if (typeof value === 'object') {
      return this.sanitizeObject(value, options);
    }

    return value;
  }

  /**
   * 脱敏对象
   * @param obj 原始对象
   * @param options 脱敏选项
   * @param currentDepth 当前递归深度
   */
  sanitizeObject(
    obj: Record<string, any>,
    options: SanitizeOptions = {},
    currentDepth: number = 0,
  ): Record<string, any> {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const maxDepth = options.maxDepth ?? 10;
    if (currentDepth >= maxDepth) {
      return obj;
    }

    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      // 检查是否在排除列表中
      if (options.excludeFields?.includes(key)) {
        result[key] = value;
        continue;
      }

      // 检查是否是敏感字段
      const fieldConfig = this.findSensitiveFieldConfig(key, options.additionalFields);

      if (fieldConfig) {
        result[key] = this.applySanitization(value, fieldConfig, options.mode);
      } else if (value && typeof value === 'object' && options.recursive !== false) {
        // 递归处理嵌套对象
        if (Array.isArray(value)) {
          result[key] = value.map((item) =>
            typeof item === 'object'
              ? this.sanitizeObject(item, options, currentDepth + 1)
              : item,
          );
        } else {
          result[key] = this.sanitizeObject(value, options, currentDepth + 1);
        }
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * 脱敏日志消息
   * @param message 日志消息
   */
  sanitizeLogMessage(message: string): string {
    let sanitized = message;

    // 脱敏 JWT Token
    sanitized = sanitized.replace(
      /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
      '[JWT:REDACTED]',
    );

    // 脱敏邮箱
    sanitized = sanitized.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      (match) => this.sanitizeEmail(match),
    );

    // 脱敏信用卡号
    sanitized = sanitized.replace(
      /\b[0-9]{13,19}\b/g,
      (match) => (isLuhnValid(match) ? this.sanitizeCreditCard(match) : match),
    );

    // 脱敏密码字段
    sanitized = sanitized.replace(
      /(password|secret|token|key)\s*[=:]\s*['"]?[^'"\s,}]+['"]?/gi,
      '$1=[REDACTED]',
    );

    return sanitized;
  }

  /**
   * 检测值是否包含敏感数据
   * @param value 要检测的值
   */
  detectSensitiveData(value: any): { isSensitive: boolean; type?: string } {
    if (typeof value !== 'string') {
      return { isSensitive: false };
    }

    for (const pattern of SENSITIVE_VALUE_PATTERNS) {
      if (pattern.pattern.test(value)) {
        if (pattern.validator && !pattern.validator(value)) {
          continue;
        }
        return { isSensitive: true, type: pattern.type };
      }
    }

    return { isSensitive: false };
  }

  /**
   * 创建脱敏后的日志对象
   * @param obj 原始对象
   */
  createSafeLogObject(obj: Record<string, any>): Record<string, any> {
    return this.sanitizeObject(obj, {
      recursive: true,
      maxDepth: 5,
    });
  }

  /**
   * 查找敏感字段配置
   */
  private findSensitiveFieldConfig(
    fieldName: string,
    additionalFields?: string[],
  ): SensitiveFieldConfig | null {
    // 检查额外的敏感字段
    if (additionalFields?.some((f) => f.toLowerCase() === fieldName.toLowerCase())) {
      return { pattern: new RegExp(`^${fieldName}$`, 'i'), mode: SanitizeMode.FULL };
    }

    // 检查默认配置
    return this.sensitiveFields.find((config) => config.pattern.test(fieldName)) || null;
  }

  /**
   * 应用脱敏
   */
  private applySanitization(
    value: any,
    config: SensitiveFieldConfig,
    overrideMode?: SanitizeMode,
  ): any {
    if (value === null || value === undefined) {
      return value;
    }

    // 使用自定义脱敏函数
    if (config.customSanitizer) {
      return config.customSanitizer(value);
    }

    const mode = overrideMode || config.mode;
    const strValue = String(value);

    switch (mode) {
      case SanitizeMode.FULL:
        return '[REDACTED]';

      case SanitizeMode.PARTIAL:
        return this.partialMask(strValue);

      case SanitizeMode.HASH:
        return `[HASH:${this.simpleHash(strValue)}]`;

      case SanitizeMode.TYPE:
        return this.getTypeLabel(strValue);

      case SanitizeMode.FORMAT:
        return this.formatMask(strValue);

      default:
        return '[REDACTED]';
    }
  }

  /**
   * 脱敏字符串
   */
  private sanitizeString(
    value: string,
    fieldName?: string,
    options: SanitizeOptions = {},
  ): string {
    // 检测值类型并脱敏
    const detection = this.detectSensitiveData(value);
    if (detection.isSensitive) {
      return `[${detection.type}:REDACTED]`;
    }

    return value;
  }

  /**
   * 部分遮蔽
   */
  private partialMask(value: string): string {
    if (value.length <= 4) {
      return '****';
    }
    if (value.length <= 8) {
      return value.slice(0, 2) + '****' + value.slice(-2);
    }
    return value.slice(0, 3) + '****' + value.slice(-3);
  }

  /**
   * 邮箱脱敏
   */
  private sanitizeEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '****@****';

    const maskedLocal = local.length > 2
      ? local[0] + '***' + local.slice(-1)
      : '***';

    const domainParts = domain.split('.');
    const maskedDomain = domainParts.length > 1
      ? '***.' + domainParts.slice(-1)[0]
      : '***';

    return `${maskedLocal}@${maskedDomain}`;
  }

  /**
   * 信用卡号脱敏
   */
  private sanitizeCreditCard(cardNumber: string): string {
    const digits = cardNumber.replace(/\D/g, '');
    if (digits.length < 13) return '****';
    return '**** **** **** ' + digits.slice(-4);
  }

  /**
   * 格式遮蔽（保留格式）
   */
  private formatMask(value: string): string {
    // SSN 格式：***-**-1234
    if (/^\d{3}-\d{2}-\d{4}$/.test(value)) {
      return '***-**-' + value.slice(-4);
    }

    // 信用卡格式
    if (/^\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}$/.test(value)) {
      return '**** **** **** ' + value.replace(/\D/g, '').slice(-4);
    }

    // 电话格式
    if (/^\+?\d{10,15}$/.test(value.replace(/[\s-]/g, ''))) {
      const digits = value.replace(/\D/g, '');
      return '****' + digits.slice(-4);
    }

    // 默认部分遮蔽
    return this.partialMask(value);
  }

  /**
   * 简单哈希（用于标识，非安全用途）
   */
  private simpleHash(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).slice(0, 6);
  }

  /**
   * 获取类型标签
   */
  private getTypeLabel(value: string): string {
    const detection = this.detectSensitiveData(value);
    if (detection.type) {
      return `[${detection.type}]`;
    }

    // 基于值特征推断类型
    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) {
      return '[EMAIL]';
    }
    if (/^\d{10,}$/.test(value.replace(/\D/g, ''))) {
      return '[NUMBER]';
    }

    return '[REDACTED]';
  }
}
