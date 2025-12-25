/**
 * Helmet 安全头配置
 * 配置 HTTP 安全响应头
 */

import { HelmetOptions } from 'helmet';

/**
 * 获取 Helmet 配置
 *
 * @param options 额外配置选项
 * @returns Helmet 配置对象
 */
export function getHelmetConfig(options?: {
  /** 是否为生产环境 */
  isProduction?: boolean;
  /** 允许的 frame 来源 */
  frameAncestors?: string[];
  /** 允许的脚本来源 */
  scriptSrc?: string[];
  /** 允许的样式来源 */
  styleSrc?: string[];
  /** 允许的图片来源 */
  imgSrc?: string[];
  /** 允许的连接来源（API、WebSocket） */
  connectSrc?: string[];
  /** 允许的字体来源 */
  fontSrc?: string[];
}): HelmetOptions {
  const isProduction = options?.isProduction ?? process.env.NODE_ENV === 'production';

  // 默认来源配置
  const defaultScriptSrc = ["'self'"];
  const defaultStyleSrc = ["'self'", "'unsafe-inline'"]; // 某些 UI 库需要 inline styles
  const defaultImgSrc = ["'self'", 'data:', 'blob:'];
  const defaultConnectSrc = ["'self'"];
  const defaultFontSrc = ["'self'", 'data:'];
  const defaultFrameAncestors = ["'none'"];

  // 合并用户配置
  const scriptSrc = options?.scriptSrc || defaultScriptSrc;
  const styleSrc = options?.styleSrc || defaultStyleSrc;
  const imgSrc = options?.imgSrc || defaultImgSrc;
  const connectSrc = options?.connectSrc || defaultConnectSrc;
  const fontSrc = options?.fontSrc || defaultFontSrc;
  const frameAncestors = options?.frameAncestors || defaultFrameAncestors;

  return {
    // Content-Security-Policy
    // 控制资源加载来源，防止 XSS 和数据注入攻击
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc,
            styleSrc,
            imgSrc,
            connectSrc,
            fontSrc,
            objectSrc: ["'none'"],
            mediaSrc: ["'none'"],
            frameSrc: ["'none'"],
            frameAncestors,
            formAction: ["'self'"],
            baseUri: ["'self'"],
            upgradeInsecureRequests: [],
          },
        }
      : false, // 开发环境禁用 CSP 以便调试

    // X-DNS-Prefetch-Control
    // 控制 DNS 预获取，减少隐私泄露
    dnsPrefetchControl: {
      allow: false,
    },

    // X-Frame-Options
    // 防止点击劫持攻击
    frameguard: {
      action: 'deny',
    },

    // Strict-Transport-Security (HSTS)
    // 强制使用 HTTPS
    hsts: isProduction
      ? {
          maxAge: 31536000, // 1 年
          includeSubDomains: true,
          preload: true,
        }
      : false,

    // X-Download-Options
    // 防止 IE 下载后自动执行
    ieNoOpen: true,

    // X-Content-Type-Options
    // 防止 MIME 类型嗅探
    noSniff: true,

    // X-Permitted-Cross-Domain-Policies
    // 控制 Flash 和 PDF 跨域请求
    permittedCrossDomainPolicies: {
      permittedPolicies: 'none',
    },

    // Referrer-Policy
    // 控制 Referer 头信息泄露
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin',
    },

    // X-XSS-Protection
    // 已弃用，但为兼容旧浏览器仍保留
    xssFilter: true,

    // Cross-Origin-Embedder-Policy
    // 控制跨域资源嵌入
    crossOriginEmbedderPolicy: isProduction
      ? { policy: 'require-corp' as const }
      : false,

    // Cross-Origin-Opener-Policy
    // 控制跨域窗口关系
    crossOriginOpenerPolicy: isProduction
      ? { policy: 'same-origin' as const }
      : false,

    // Cross-Origin-Resource-Policy
    // 控制跨域资源访问
    crossOriginResourcePolicy: {
      policy: 'same-origin' as const,
    },

    // Origin-Agent-Cluster
    // 隔离浏览上下文
    originAgentCluster: true,
  };
}

/**
 * 生产环境 Helmet 配置
 */
export const productionHelmetConfig = getHelmetConfig({ isProduction: true });

/**
 * 开发环境 Helmet 配置
 */
export const developmentHelmetConfig = getHelmetConfig({ isProduction: false });

/**
 * API 服务专用 Helmet 配置
 * 针对纯 API 服务优化，更严格的策略
 */
export const apiHelmetConfig = getHelmetConfig({
  isProduction: true,
  scriptSrc: ["'none'"], // API 不需要脚本
  styleSrc: ["'none'"], // API 不需要样式
  imgSrc: ["'none'"], // API 不需要图片
  frameAncestors: ["'none'"],
});

/**
 * 获取环境对应的 Helmet 配置
 */
export function getEnvironmentHelmetConfig(): HelmetOptions {
  const env = process.env.NODE_ENV || 'development';

  switch (env) {
    case 'production':
      return productionHelmetConfig;
    case 'test':
      return developmentHelmetConfig;
    default:
      return developmentHelmetConfig;
  }
}
