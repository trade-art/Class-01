/**
 * 自定义验证装饰器
 * 提供安全相关的验证功能
 */

import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// ============================================
// 安全字符串验证（防 XSS）
// ============================================

/**
 * XSS 危险模式
 */
const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<script\b/gi,
  /javascript:/gi,
  /on\w+\s*=/gi, // onclick, onerror, etc.
  /<iframe\b/gi,
  /<object\b/gi,
  /<embed\b/gi,
  /<form\b/gi,
  /<input\b.*\btype\s*=\s*["']?hidden/gi,
  /expression\s*\(/gi,
  /url\s*\(/gi,
  /data:/gi,
  /vbscript:/gi,
];

@ValidatorConstraint({ name: 'isSafeString', async: false })
export class IsSafeStringConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return true; // 非字符串由其他验证器处理
    }

    // 检查 XSS 模式
    for (const pattern of XSS_PATTERNS) {
      if (pattern.test(value)) {
        return false;
      }
    }

    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} 包含潜在的恶意内容`;
  }
}

/**
 * 安全字符串验证装饰器
 * 检查字符串是否包含 XSS 攻击向量
 */
export function IsSafeString(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsSafeStringConstraint,
    });
  };
}

// ============================================
// 密码强度验证
// ============================================

export interface PasswordStrengthOptions {
  /** 最小长度（默认 8） */
  minLength?: number;
  /** 最大长度（默认 128） */
  maxLength?: number;
  /** 是否需要大写字母（默认 true） */
  requireUppercase?: boolean;
  /** 是否需要小写字母（默认 true） */
  requireLowercase?: boolean;
  /** 是否需要数字（默认 true） */
  requireNumber?: boolean;
  /** 是否需要特殊字符（默认 true） */
  requireSpecial?: boolean;
  /** 禁止常见弱密码（默认 true） */
  forbidCommonPasswords?: boolean;
}

/**
 * 常见弱密码列表
 */
const COMMON_PASSWORDS = new Set([
  'password', 'password123', '123456', '12345678', '123456789',
  'qwerty', 'abc123', 'password1', 'admin', 'letmein',
  'welcome', 'monkey', '1234567', 'dragon', 'master',
  'sunshine', 'princess', 'football', 'iloveyou', 'trustno1',
  'passw0rd', 'p@ssword', 'p@ssw0rd', 'admin123', 'root',
]);

@ValidatorConstraint({ name: 'isSecurePassword', async: false })
export class IsSecurePasswordConstraint implements ValidatorConstraintInterface {
  private options: PasswordStrengthOptions;
  private failureReason: string = '';

  constructor() {
    this.options = {};
  }

  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      this.failureReason = '密码必须是字符串';
      return false;
    }

    const options: PasswordStrengthOptions = args.constraints[0] || {};
    const minLength = options.minLength ?? 8;
    const maxLength = options.maxLength ?? 128;
    const requireUppercase = options.requireUppercase ?? true;
    const requireLowercase = options.requireLowercase ?? true;
    const requireNumber = options.requireNumber ?? true;
    const requireSpecial = options.requireSpecial ?? true;
    const forbidCommonPasswords = options.forbidCommonPasswords ?? true;

    // 长度检查
    if (value.length < minLength) {
      this.failureReason = `密码长度至少 ${minLength} 个字符`;
      return false;
    }

    if (value.length > maxLength) {
      this.failureReason = `密码长度不能超过 ${maxLength} 个字符`;
      return false;
    }

    // 复杂性检查
    if (requireUppercase && !/[A-Z]/.test(value)) {
      this.failureReason = '密码必须包含至少一个大写字母';
      return false;
    }

    if (requireLowercase && !/[a-z]/.test(value)) {
      this.failureReason = '密码必须包含至少一个小写字母';
      return false;
    }

    if (requireNumber && !/[0-9]/.test(value)) {
      this.failureReason = '密码必须包含至少一个数字';
      return false;
    }

    if (requireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value)) {
      this.failureReason = '密码必须包含至少一个特殊字符';
      return false;
    }

    // 常见弱密码检查
    if (forbidCommonPasswords && COMMON_PASSWORDS.has(value.toLowerCase())) {
      this.failureReason = '密码过于简单，请使用更复杂的密码';
      return false;
    }

    return true;
  }

  defaultMessage(): string {
    return this.failureReason || '密码不符合安全要求';
  }
}

/**
 * 安全密码验证装饰器
 */
export function IsSecurePassword(
  options?: PasswordStrengthOptions,
  validationOptions?: ValidationOptions
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [options || {}],
      validator: IsSecurePasswordConstraint,
    });
  };
}

// ============================================
// 租户 ID 验证
// ============================================

/**
 * UUID v4 格式验证
 */
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@ValidatorConstraint({ name: 'isTenantId', async: false })
export class IsTenantIdConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    return UUID_V4_PATTERN.test(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} 必须是有效的租户 ID（UUID v4 格式）`;
  }
}

/**
 * 租户 ID 验证装饰器
 */
export function IsTenantId(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsTenantIdConstraint,
    });
  };
}

// ============================================
// SQL 注入检测
// ============================================

/**
 * SQL 注入危险模式
 */
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC|EXECUTE)\b)/gi,
  /(\b(UNION|JOIN|WHERE|FROM|INTO|VALUES|SET|OR|AND)\b\s+.*=)/gi,
  /(--|\#|\/\*|\*\/)/g,
  /(\bOR\b\s+\S+\s*=\s*\S+)/gi,
  /(\bAND\b\s+\S+\s*=\s*\S+)/gi,
  /(;\s*(SELECT|INSERT|UPDATE|DELETE|DROP))/gi,
  /(\'\s*(OR|AND)\s+\')/gi,
  /(1\s*=\s*1)/gi,
  /(1\s*=\s*\'1\')/gi,
  /(\bLIKE\b\s+[\'\"]\%)/gi,
  /(WAITFOR\s+DELAY)/gi,
  /(BENCHMARK\s*\()/gi,
  /(SLEEP\s*\()/gi,
  /(\bINFORMATION_SCHEMA\b)/gi,
  /(\bSYSOBJECTS\b)/gi,
  /(\bSYSCOLUMNS\b)/gi,
];

@ValidatorConstraint({ name: 'isNotSqlInjection', async: false })
export class IsNotSqlInjectionConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return true;
    }

    // 检查 SQL 注入模式
    for (const pattern of SQL_INJECTION_PATTERNS) {
      if (pattern.test(value)) {
        return false;
      }
    }

    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} 包含潜在的 SQL 注入内容`;
  }
}

/**
 * SQL 注入检测装饰器
 */
export function IsNotSqlInjection(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsNotSqlInjectionConstraint,
    });
  };
}

// ============================================
// 命令注入检测
// ============================================

/**
 * 命令注入危险模式
 */
const COMMAND_INJECTION_PATTERNS = [
  /[;&|`$]/,
  /\$\(.*\)/,
  /`.*`/,
  /\|\s*\w+/,
  /;\s*\w+/,
  /&&\s*\w+/,
  /\|\|\s*\w+/,
  />\s*\/\w+/,
  /<\s*\/\w+/,
  /\brm\s+-rf\b/i,
  /\b(cat|ls|cd|pwd|echo|curl|wget|nc|netcat)\b/i,
  /\/etc\/passwd/i,
  /\/etc\/shadow/i,
];

@ValidatorConstraint({ name: 'isNotCommandInjection', async: false })
export class IsNotCommandInjectionConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return true;
    }

    // 检查命令注入模式
    for (const pattern of COMMAND_INJECTION_PATTERNS) {
      if (pattern.test(value)) {
        return false;
      }
    }

    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} 包含潜在的命令注入内容`;
  }
}

/**
 * 命令注入检测装饰器
 */
export function IsNotCommandInjection(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsNotCommandInjectionConstraint,
    });
  };
}

// ============================================
// 安全邮箱验证
// ============================================

/**
 * 邮箱格式验证（更严格的版本）
 */
const SECURE_EMAIL_PATTERN = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

@ValidatorConstraint({ name: 'isSecureEmail', async: false })
export class IsSecureEmailConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    // 基本格式验证
    if (!SECURE_EMAIL_PATTERN.test(value)) {
      return false;
    }

    // 长度限制
    if (value.length > 254) {
      return false;
    }

    // 检查潜在的注入
    const safeStringConstraint = new IsSafeStringConstraint();
    if (!safeStringConstraint.validate(value)) {
      return false;
    }

    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} 必须是有效的邮箱地址`;
  }
}

/**
 * 安全邮箱验证装饰器
 */
export function IsSecureEmail(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsSecureEmailConstraint,
    });
  };
}

// ============================================
// 安全输入组合装饰器
// ============================================

/**
 * 综合安全输入验证装饰器
 * 同时检查 XSS、SQL 注入和命令注入
 */
export function IsSecureInput(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    // 注册所有安全检查
    IsSafeString(validationOptions)(object, propertyName);
    IsNotSqlInjection(validationOptions)(object, propertyName);
    IsNotCommandInjection(validationOptions)(object, propertyName);
  };
}
