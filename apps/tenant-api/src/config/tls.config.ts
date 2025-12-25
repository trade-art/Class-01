/**
 * TLS/SSL 配置模块
 * 定义传输层安全相关的配置类型和常量
 */

/**
 * HSTS (HTTP Strict Transport Security) 配置
 */
export interface HstsConfig {
  /** 是否启用 HSTS */
  enabled: boolean;
  /** HSTS 最大有效期（秒），默认 2 年 */
  maxAge: number;
  /** 是否包含子域名 */
  includeSubDomains: boolean;
  /** 是否支持 HSTS 预加载列表 */
  preload: boolean;
}

/**
 * TLS/SSL 配置
 */
export interface TlsConfig {
  /** 是否启用 TLS */
  enabled: boolean;
  /** 最小 TLS 版本 */
  minVersion: 'TLSv1.2' | 'TLSv1.3';
  /** SSL 证书路径 */
  certPath: string;
  /** SSL 私钥路径 */
  keyPath: string;
  /** HSTS 配置 */
  hsts: HstsConfig;
}

/**
 * 支持的 TLS 版本
 */
export const SUPPORTED_TLS_VERSIONS = ['TLSv1.2', 'TLSv1.3'] as const;

/**
 * Mozilla 推荐的现代加密套件
 * @see https://ssl-config.mozilla.org/
 */
export const MODERN_CIPHER_SUITES = [
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'DHE-RSA-AES128-GCM-SHA256',
  'DHE-RSA-AES256-GCM-SHA384',
] as const;

/**
 * 不安全的加密套件（应被禁止）
 */
export const INSECURE_CIPHER_SUITES = [
  'DES-CBC3-SHA',
  'RC4',
  'MD5',
  'EXPORT',
  'aNULL',
  'eNULL',
  'SEED',
  'IDEA',
  'PSK',
] as const;

/**
 * 安全响应头配置
 */
export const SECURITY_HEADERS = {
  /** 防止点击劫持 */
  'X-Frame-Options': 'SAMEORIGIN',
  /** 防止 MIME 类型嗅探 */
  'X-Content-Type-Options': 'nosniff',
  /** XSS 防护 */
  'X-XSS-Protection': '1; mode=block',
  /** 引用来源策略 */
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  /** 权限策略 */
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
} as const;

/**
 * 生成 HSTS 响应头值
 */
export function buildHstsHeader(config: HstsConfig): string {
  if (!config.enabled) {
    return '';
  }

  const parts = [`max-age=${config.maxAge}`];

  if (config.includeSubDomains) {
    parts.push('includeSubDomains');
  }

  if (config.preload) {
    parts.push('preload');
  }

  return parts.join('; ');
}

/**
 * 生成 Content-Security-Policy 响应头
 * @param options CSP 配置选项
 */
export function buildCspHeader(options?: {
  /** 是否允许内联脚本 */
  allowInlineScripts?: boolean;
  /** 是否允许内联样式 */
  allowInlineStyles?: boolean;
  /** 允许的外部脚本来源 */
  scriptSrc?: string[];
  /** 允许的外部样式来源 */
  styleSrc?: string[];
  /** 允许的 API 连接来源 */
  connectSrc?: string[];
}): string {
  const directives: string[] = [];

  // 默认来源
  directives.push("default-src 'self'");

  // 脚本来源
  const scriptParts = ["'self'"];
  if (options?.allowInlineScripts) {
    scriptParts.push("'unsafe-inline'", "'unsafe-eval'");
  }
  if (options?.scriptSrc) {
    scriptParts.push(...options.scriptSrc);
  }
  directives.push(`script-src ${scriptParts.join(' ')}`);

  // 样式来源
  const styleParts = ["'self'"];
  if (options?.allowInlineStyles) {
    styleParts.push("'unsafe-inline'");
  }
  if (options?.styleSrc) {
    styleParts.push(...options.styleSrc);
  }
  directives.push(`style-src ${styleParts.join(' ')}`);

  // 图片来源
  directives.push("img-src 'self' data: https:");

  // 字体来源
  directives.push("font-src 'self' data:");

  // API 连接来源
  const connectParts = ["'self'", 'wss:', 'https:'];
  if (options?.connectSrc) {
    connectParts.push(...options.connectSrc);
  }
  directives.push(`connect-src ${connectParts.join(' ')}`);

  // 框架来源
  directives.push("frame-ancestors 'self'");

  return directives.join('; ');
}

/**
 * 验证 TLS 配置是否安全
 */
export function validateTlsConfig(config: TlsConfig): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  // 检查 TLS 版本
  if (!SUPPORTED_TLS_VERSIONS.includes(config.minVersion as any)) {
    errors.push(`Unsupported TLS version: ${config.minVersion}`);
  }

  if (config.minVersion === 'TLSv1.2') {
    warnings.push('Consider upgrading to TLSv1.3 for better security');
  }

  // 检查 HSTS 配置
  if (config.hsts.enabled) {
    if (config.hsts.maxAge < 31536000) {
      // 1 年
      warnings.push('HSTS max-age should be at least 1 year (31536000 seconds)');
    }

    if (config.hsts.preload && !config.hsts.includeSubDomains) {
      errors.push('HSTS preload requires includeSubDomains');
    }
  } else if (config.enabled) {
    warnings.push('HSTS is disabled but TLS is enabled - consider enabling HSTS');
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}
