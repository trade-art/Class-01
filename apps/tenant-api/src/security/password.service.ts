/**
 * 密码安全服务
 * 提供密码加密、强度验证、历史检查等功能
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

/**
 * 密码强度等级
 */
export enum PasswordStrength {
  WEAK = 'weak',
  FAIR = 'fair',
  STRONG = 'strong',
  VERY_STRONG = 'very_strong',
}

/**
 * 密码验证结果
 */
export interface PasswordValidationResult {
  /** 是否有效 */
  isValid: boolean;
  /** 强度等级 */
  strength: PasswordStrength;
  /** 强度分数 (0-100) */
  score: number;
  /** 验证错误 */
  errors: string[];
  /** 改进建议 */
  suggestions: string[];
}

/**
 * 密码策略配置
 */
export interface PasswordPolicy {
  /** 最小长度 */
  minLength: number;
  /** 最大长度 */
  maxLength: number;
  /** 需要大写字母 */
  requireUppercase: boolean;
  /** 需要小写字母 */
  requireLowercase: boolean;
  /** 需要数字 */
  requireNumber: boolean;
  /** 需要特殊字符 */
  requireSpecialChar: boolean;
  /** 禁止常见密码 */
  rejectCommonPasswords: boolean;
  /** 禁止包含用户名 */
  rejectUsername: boolean;
  /** 最小强度等级 */
  minStrength: PasswordStrength;
}

/**
 * 默认密码策略
 */
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialChar: true,
  rejectCommonPasswords: true,
  rejectUsername: true,
  minStrength: PasswordStrength.FAIR,
};

/**
 * 常见弱密码列表（部分示例）
 */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '123456', '12345678',
  'qwerty', 'qwerty123', 'abc123', 'admin', 'admin123',
  'letmein', 'welcome', 'monkey', '1234567890', 'password1!',
  'iloveyou', 'sunshine', 'princess', '123456789', 'football',
  '111111', '000000', 'dragon', 'master', 'login',
]);

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);
  private readonly bcryptRounds: number;
  private readonly policy: PasswordPolicy;

  constructor(private readonly configService: ConfigService) {
    // 确保 bcrypt rounds >= 12
    const configuredRounds = this.configService.get<number>('security.bcryptRounds', 12);
    this.bcryptRounds = Math.max(configuredRounds, 12);

    // 加载密码策略配置
    this.policy = {
      ...DEFAULT_PASSWORD_POLICY,
      minLength: this.configService.get<number>('security.password.minLength', 8),
      requireUppercase: this.configService.get<boolean>('security.password.requireUppercase', true),
      requireLowercase: this.configService.get<boolean>('security.password.requireLowercase', true),
      requireNumber: this.configService.get<boolean>('security.password.requireNumber', true),
      requireSpecialChar: this.configService.get<boolean>('security.password.requireSpecialChar', true),
    };

    this.logger.log(`Password service initialized with bcrypt rounds: ${this.bcryptRounds}`);
  }

  /**
   * 加密密码
   * @param password 明文密码
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.bcryptRounds);
  }

  /**
   * 验证密码
   * @param password 明文密码
   * @param hashedPassword 加密后的密码
   */
  async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  /**
   * 验证密码强度和策略
   * @param password 密码
   * @param username 可选的用户名（用于检查是否包含）
   */
  validatePassword(password: string, username?: string): PasswordValidationResult {
    const errors: string[] = [];
    const suggestions: string[] = [];
    let score = 0;

    // 检查长度
    if (password.length < this.policy.minLength) {
      errors.push(`密码长度至少需要 ${this.policy.minLength} 个字符`);
    } else if (password.length >= this.policy.minLength) {
      score += 20;
      if (password.length >= 12) {
        score += 10;
      }
      if (password.length >= 16) {
        score += 10;
      }
    }

    if (password.length > this.policy.maxLength) {
      errors.push(`密码长度不能超过 ${this.policy.maxLength} 个字符`);
    }

    // 检查大写字母
    const hasUppercase = /[A-Z]/.test(password);
    if (this.policy.requireUppercase && !hasUppercase) {
      errors.push('密码需要包含至少一个大写字母');
    } else if (hasUppercase) {
      score += 15;
    }

    // 检查小写字母
    const hasLowercase = /[a-z]/.test(password);
    if (this.policy.requireLowercase && !hasLowercase) {
      errors.push('密码需要包含至少一个小写字母');
    } else if (hasLowercase) {
      score += 15;
    }

    // 检查数字
    const hasNumber = /[0-9]/.test(password);
    if (this.policy.requireNumber && !hasNumber) {
      errors.push('密码需要包含至少一个数字');
    } else if (hasNumber) {
      score += 15;
    }

    // 检查特殊字符
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    if (this.policy.requireSpecialChar && !hasSpecialChar) {
      errors.push('密码需要包含至少一个特殊字符 (!@#$%^&*等)');
    } else if (hasSpecialChar) {
      score += 15;
    }

    // 检查常见密码
    if (this.policy.rejectCommonPasswords) {
      const lowerPassword = password.toLowerCase();
      if (COMMON_PASSWORDS.has(lowerPassword)) {
        errors.push('不能使用常见的弱密码');
        score = Math.max(score - 30, 0);
      }
    }

    // 检查是否包含用户名
    if (this.policy.rejectUsername && username) {
      const lowerPassword = password.toLowerCase();
      const lowerUsername = username.toLowerCase();
      if (lowerPassword.includes(lowerUsername) || lowerUsername.includes(lowerPassword)) {
        errors.push('密码不能包含用户名');
        score = Math.max(score - 20, 0);
      }
    }

    // 检查连续字符
    if (this.hasSequentialChars(password)) {
      suggestions.push('避免使用连续的字符（如 abc、123）');
      score = Math.max(score - 10, 0);
    }

    // 检查重复字符
    if (this.hasRepeatedChars(password)) {
      suggestions.push('避免使用重复的字符（如 aaa、111）');
      score = Math.max(score - 10, 0);
    }

    // 确保分数在 0-100 范围内
    score = Math.min(Math.max(score, 0), 100);

    // 确定强度等级
    const strength = this.calculateStrength(score);

    // 生成建议
    if (score < 60) {
      if (!hasUppercase) suggestions.push('添加大写字母');
      if (!hasLowercase) suggestions.push('添加小写字母');
      if (!hasNumber) suggestions.push('添加数字');
      if (!hasSpecialChar) suggestions.push('添加特殊字符');
      if (password.length < 12) suggestions.push('增加密码长度');
    }

    // 检查最小强度要求
    const strengthOrder = [
      PasswordStrength.WEAK,
      PasswordStrength.FAIR,
      PasswordStrength.STRONG,
      PasswordStrength.VERY_STRONG,
    ];
    const currentStrengthIndex = strengthOrder.indexOf(strength);
    const requiredStrengthIndex = strengthOrder.indexOf(this.policy.minStrength);

    if (currentStrengthIndex < requiredStrengthIndex) {
      errors.push(`密码强度不足，需要达到 "${this.getStrengthLabel(this.policy.minStrength)}" 级别`);
    }

    return {
      isValid: errors.length === 0,
      strength,
      score,
      errors,
      suggestions,
    };
  }

  /**
   * 检查密码是否在历史记录中
   * @param password 新密码
   * @param passwordHistory 历史密码（加密后）
   */
  async isPasswordInHistory(
    password: string,
    passwordHistory: string[],
  ): Promise<boolean> {
    for (const historicalPassword of passwordHistory) {
      const isMatch = await bcrypt.compare(password, historicalPassword);
      if (isMatch) {
        return true;
      }
    }
    return false;
  }

  /**
   * 生成随机密码
   * @param length 密码长度
   */
  generateRandomPassword(length: number = 16): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    const allChars = uppercase + lowercase + numbers + special;

    // 确保至少包含每种类型的字符
    let password = '';
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // 填充剩余长度
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // 打乱顺序
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * 获取密码策略
   */
  getPolicy(): PasswordPolicy {
    return { ...this.policy };
  }

  /**
   * 获取 bcrypt rounds
   */
  getBcryptRounds(): number {
    return this.bcryptRounds;
  }

  /**
   * 计算密码强度等级
   */
  private calculateStrength(score: number): PasswordStrength {
    if (score >= 80) return PasswordStrength.VERY_STRONG;
    if (score >= 60) return PasswordStrength.STRONG;
    if (score >= 40) return PasswordStrength.FAIR;
    return PasswordStrength.WEAK;
  }

  /**
   * 获取强度等级标签
   */
  private getStrengthLabel(strength: PasswordStrength): string {
    const labels: Record<PasswordStrength, string> = {
      [PasswordStrength.WEAK]: '弱',
      [PasswordStrength.FAIR]: '一般',
      [PasswordStrength.STRONG]: '强',
      [PasswordStrength.VERY_STRONG]: '非常强',
    };
    return labels[strength];
  }

  /**
   * 检查连续字符
   */
  private hasSequentialChars(password: string): boolean {
    const sequences = [
      'abcdefghijklmnopqrstuvwxyz',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      '0123456789',
      'qwertyuiop',
      'asdfghjkl',
      'zxcvbnm',
    ];

    const lowerPassword = password.toLowerCase();

    for (const seq of sequences) {
      for (let i = 0; i <= seq.length - 3; i++) {
        const subseq = seq.substring(i, i + 3);
        if (lowerPassword.includes(subseq)) {
          return true;
        }
        // 检查反向序列
        const reverseSubseq = subseq.split('').reverse().join('');
        if (lowerPassword.includes(reverseSubseq)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 检查重复字符
   */
  private hasRepeatedChars(password: string): boolean {
    return /(.)\1{2,}/.test(password);
  }
}
