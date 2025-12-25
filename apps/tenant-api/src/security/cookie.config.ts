/**
 * 安全 Cookie 配置模块
 * 定义 Cookie 安全属性和配置选项
 */

import { CookieOptions } from 'express';

/**
 * Cookie 安全配置选项
 */
export interface SecureCookieOptions extends CookieOptions {
  /** Cookie 名称 */
  name: string;
  /** 是否仅在生产环境使用 Secure 标志 */
  secureInProductionOnly?: boolean;
}

/**
 * Cookie 配置类型
 */
export type CookieConfigType = 'refresh' | 'session' | 'csrf';

/**
 * 默认 Cookie 配置
 */
export const DEFAULT_COOKIE_CONFIG: Record<CookieConfigType, SecureCookieOptions> = {
  /**
   * Refresh Token Cookie 配置
   * - HttpOnly: 防止 XSS 攻击窃取 token
   * - Secure: 仅通过 HTTPS 传输
   * - SameSite: Strict 防止 CSRF
   * - Path: 限制仅刷新 token 端点可访问
   */
  refresh: {
    name: '__refresh_token',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth/refresh',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天
    secureInProductionOnly: true,
  },

  /**
   * Session Cookie 配置
   * - HttpOnly: 防止 XSS 攻击
   * - Secure: 仅通过 HTTPS 传输
   * - SameSite: Lax 允许导航请求携带
   */
  session: {
    name: '__session',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000, // 1 天
    secureInProductionOnly: true,
  },

  /**
   * CSRF Token Cookie 配置
   * - 非 HttpOnly: 允许 JavaScript 读取以发送在请求头中
   * - Secure: 仅通过 HTTPS 传输
   * - SameSite: Strict 防止跨站请求
   */
  csrf: {
    name: '__csrf_token',
    httpOnly: false, // 需要 JS 读取
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000, // 1 天
    secureInProductionOnly: true,
  },
};

/**
 * 获取 Cookie 配置
 * @param type Cookie 类型
 * @param overrides 覆盖选项
 */
export function getCookieConfig(
  type: CookieConfigType,
  overrides?: Partial<SecureCookieOptions>,
): SecureCookieOptions {
  const baseConfig = { ...DEFAULT_COOKIE_CONFIG[type] };

  // 应用覆盖
  if (overrides) {
    Object.assign(baseConfig, overrides);
  }

  // 确保生产环境使用 Secure
  if (baseConfig.secureInProductionOnly && process.env.NODE_ENV === 'production') {
    baseConfig.secure = true;
  }

  return baseConfig;
}

/**
 * Cookie 配置构建器
 */
export class CookieConfigBuilder {
  private options: SecureCookieOptions;

  constructor(type: CookieConfigType) {
    this.options = { ...DEFAULT_COOKIE_CONFIG[type] };
  }

  /**
   * 设置 Cookie 名称
   */
  name(name: string): this {
    this.options.name = name;
    return this;
  }

  /**
   * 设置 HttpOnly 属性
   */
  httpOnly(value: boolean): this {
    this.options.httpOnly = value;
    return this;
  }

  /**
   * 设置 Secure 属性
   */
  secure(value: boolean): this {
    this.options.secure = value;
    return this;
  }

  /**
   * 设置 SameSite 属性
   */
  sameSite(value: 'strict' | 'lax' | 'none'): this {
    this.options.sameSite = value;
    return this;
  }

  /**
   * 设置路径
   */
  path(path: string): this {
    this.options.path = path;
    return this;
  }

  /**
   * 设置域名
   */
  domain(domain: string): this {
    this.options.domain = domain;
    return this;
  }

  /**
   * 设置最大存活时间 (毫秒)
   */
  maxAge(ms: number): this {
    this.options.maxAge = ms;
    return this;
  }

  /**
   * 设置过期时间
   */
  expires(date: Date): this {
    this.options.expires = date;
    return this;
  }

  /**
   * 构建最终配置
   */
  build(): SecureCookieOptions {
    // 确保生产环境使用 Secure
    if (this.options.secureInProductionOnly && process.env.NODE_ENV === 'production') {
      this.options.secure = true;
    }

    // SameSite=None 时必须设置 Secure
    if (this.options.sameSite === 'none' && !this.options.secure) {
      this.options.secure = true;
    }

    return { ...this.options };
  }
}

/**
 * Cookie 安全验证
 */
export function validateCookieConfig(config: SecureCookieOptions): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  // 检查 HttpOnly
  if (!config.httpOnly && config.name.includes('token')) {
    warnings.push(`Cookie "${config.name}" contains token but is not HttpOnly - vulnerable to XSS`);
  }

  // 检查 Secure
  if (!config.secure && process.env.NODE_ENV === 'production') {
    errors.push(`Cookie "${config.name}" is not Secure in production - vulnerable to MITM`);
  }

  // 检查 SameSite
  if (!config.sameSite) {
    warnings.push(`Cookie "${config.name}" has no SameSite attribute - may be vulnerable to CSRF`);
  }

  // 检查 SameSite=None 必须有 Secure
  if (config.sameSite === 'none' && !config.secure) {
    errors.push(`Cookie "${config.name}" has SameSite=None but no Secure - will be rejected by browsers`);
  }

  // 检查过期时间
  if (!config.maxAge && !config.expires) {
    warnings.push(`Cookie "${config.name}" has no expiry - will be a session cookie`);
  }

  // 检查 maxAge 是否过长
  const maxAgeInDays = (config.maxAge || 0) / (24 * 60 * 60 * 1000);
  if (maxAgeInDays > 30) {
    warnings.push(`Cookie "${config.name}" has long expiry (${maxAgeInDays} days) - consider shorter lifetime`);
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * 创建清除 Cookie 的选项
 */
export function getClearCookieOptions(config: SecureCookieOptions): CookieOptions {
  return {
    httpOnly: config.httpOnly,
    secure: config.secure,
    sameSite: config.sameSite,
    path: config.path,
    domain: config.domain,
  };
}
