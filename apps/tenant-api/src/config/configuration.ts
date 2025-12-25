/**
 * 应用配置
 * 集中管理所有环境变量和配置项
 */

// 辅助函数：安全地解析整数环境变量
const parseIntEnv = (value: string | undefined, defaultValue: number): number =>
  value ? parseInt(value, 10) : defaultValue;

export default () => ({
  // API 前缀 - 用于区分 tenant-api 和 platform-service
  apiPrefix: process.env.API_PREFIX || 'tenant',

  // 服务端口
  port: parseIntEnv(process.env.PORT, 3200),

  // 数据库配置
  database: {
    url: process.env.DATABASE_URL,
  },

  // JWT 配置
  jwt: {
    secret: process.env.JWT_SECRET || 'tenant-api-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET || 'tenant-api-refresh-secret-key',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Service Token 配置 (用于 Tenant API -> Middleware 通信)
  serviceToken: {
    // JWT 签名密钥 (必须与中间件配置相同)
    jwtSecret: process.env.SERVICE_TOKEN_JWT_SECRET || 'middleware-service-token-secret-key-change-in-production',
    // AES-256-GCM 加密密钥 (64 字符 hex = 32 字节，必须与中间件配置相同)
    encryptionKey: process.env.SERVICE_TOKEN_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    // Token 有效期 (秒)
    expiresIn: parseIntEnv(process.env.SERVICE_TOKEN_EXPIRES_IN, 3600),
    // Token 发行者
    issuer: process.env.SERVICE_TOKEN_ISSUER || 'tenant-api',
  },

  // 中间件服务配置
  middleware: {
    baseUrl:
      process.env.MIDDLEWARE_BASE_URL || 'http://localhost:8083',
    timeout: parseIntEnv(process.env.MIDDLEWARE_TIMEOUT, 30000),
    retryAttempts: parseIntEnv(process.env.MIDDLEWARE_RETRY_ATTEMPTS, 3),
    retryDelay: parseIntEnv(process.env.MIDDLEWARE_RETRY_DELAY, 1000),
    // 中间件管理员凭证 (用于自动登录获取 token)
    adminLogin: process.env.MIDDLEWARE_ADMIN_LOGIN || '10007',
    adminPassword: process.env.MIDDLEWARE_ADMIN_PASSWORD || '-2TqZnTl',
    // Webhook 配置 (用于通知中间件)
    webhookSecret: process.env.MIDDLEWARE_WEBHOOK_SECRET || 'middleware-webhook-secret-change-in-production',
    webhookTimeout: parseIntEnv(process.env.MIDDLEWARE_WEBHOOK_TIMEOUT, 5000),
    // WebSocket 端点 (用于 WS Ticket 功能)
    wsEndpoint: process.env.MIDDLEWARE_WS_ENDPOINT || 'wss://localhost:8443',
  },

  // Redis 缓存配置
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseIntEnv(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseIntEnv(process.env.REDIS_DB, 1), // 使用 DB 1 区分于 platform-service
    ttl: parseIntEnv(process.env.REDIS_TTL, 300), // 默认 5 分钟
  },

  // 缓存 TTL 配置 (秒)
  cache: {
    quotes: parseIntEnv(process.env.CACHE_QUOTES_TTL, 5), // 报价缓存 5 秒
    positions: parseIntEnv(process.env.CACHE_POSITIONS_TTL, 10), // 持仓缓存 10 秒
    accounts: parseIntEnv(process.env.CACHE_ACCOUNTS_TTL, 60), // 账户缓存 1 分钟
    symbols: parseIntEnv(process.env.CACHE_SYMBOLS_TTL, 300), // 品种缓存 5 分钟
    default: parseIntEnv(process.env.CACHE_DEFAULT_TTL, 60), // 默认缓存 1 分钟
  },

  // WebSocket 配置
  websocket: {
    port: parseIntEnv(process.env.WS_PORT, 3003),
    pingInterval: parseIntEnv(process.env.WS_PING_INTERVAL, 30000),
    pingTimeout: parseIntEnv(process.env.WS_PING_TIMEOUT, 5000),
  },

  // 日志配置
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },

  // 安全配置
  security: {
    bcryptRounds: parseIntEnv(process.env.BCRYPT_ROUNDS, 12), // 增加到 12 轮以增强安全性
    maxLoginAttempts: parseIntEnv(process.env.MAX_LOGIN_ATTEMPTS, 5),
    lockoutDuration: parseIntEnv(process.env.LOCKOUT_DURATION, 900), // 15 分钟
  },

  // 频率限制配置 (Rate Limiting)
  // 开发模式下使用更宽松的限制
  rateLimit: {
    // 是否启用频率限制 (默认启用，开发环境可设为 false)
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    // 登录限制: 开发模式 100次/15分钟, 生产模式 5次/15分钟
    login: {
      maxRequests: parseIntEnv(
        process.env.RATE_LIMIT_LOGIN_MAX,
        process.env.NODE_ENV === 'production' ? 5 : 100,
      ),
      windowSeconds: parseIntEnv(process.env.RATE_LIMIT_LOGIN_WINDOW, 900),
    },
    // 通用 API 限制
    general: {
      maxRequests: parseIntEnv(process.env.RATE_LIMIT_GENERAL_MAX, 100),
      windowSeconds: parseIntEnv(process.env.RATE_LIMIT_GENERAL_WINDOW, 60),
    },
    // 敏感操作限制
    sensitive: {
      maxRequests: parseIntEnv(process.env.RATE_LIMIT_SENSITIVE_MAX, 10),
      windowSeconds: parseIntEnv(process.env.RATE_LIMIT_SENSITIVE_WINDOW, 60),
    },
  },

  // TLS/SSL 配置
  tls: {
    enabled: process.env.TLS_ENABLED === 'true',
    minVersion: process.env.TLS_MIN_VERSION || 'TLSv1.2',
    certPath: process.env.TLS_CERT_PATH || '/etc/nginx/ssl/fullchain.pem',
    keyPath: process.env.TLS_KEY_PATH || '/etc/nginx/ssl/privkey.pem',
    // HSTS 配置
    hsts: {
      enabled: process.env.HSTS_ENABLED !== 'false', // 默认启用
      maxAge: parseIntEnv(process.env.HSTS_MAX_AGE, 63072000), // 2 年
      includeSubDomains: process.env.HSTS_INCLUDE_SUBDOMAINS !== 'false',
      preload: process.env.HSTS_PRELOAD === 'true',
    },
  },

  // 风控配置
  risk: {
    checkInterval: parseIntEnv(process.env.RISK_CHECK_INTERVAL, 60000), // 1 分钟
    alertRetentionDays: parseIntEnv(process.env.RISK_ALERT_RETENTION_DAYS, 30),
  },

  // 报表配置
  reports: {
    maxExportRows: parseIntEnv(process.env.REPORTS_MAX_EXPORT_ROWS, 10000),
    defaultPageSize: parseIntEnv(process.env.REPORTS_DEFAULT_PAGE_SIZE, 20),
  },

  // Internal API 配置 (用于中间件回调)
  internalApi: {
    secret: process.env.INTERNAL_API_SECRET || 'internal-secret-change-me',
  },

  // Manager API Key 配置 (连接池模式)
  managerApiKey: {
    jwtSecret: process.env.MANAGER_API_KEY_JWT_SECRET || process.env.JWT_SECRET || 'manager-api-key-secret',
    expiresIn: parseIntEnv(process.env.MANAGER_API_KEY_JWT_EXPIRES_IN, 900), // 15 分钟
    refreshExpiresIn: parseIntEnv(process.env.MANAGER_API_KEY_REFRESH_EXPIRES_IN, 604800), // 7 天
  },

  // 特性开关
  features: {
    // 连接池模式 - 启用后使用 managerId (UUID) 替代 managerLogin 在 Token 中
    connectionPoolMode: process.env.FEATURE_CONNECTION_POOL_MODE !== 'false', // 默认启用
    // 简化 Token 结构 - 移除敏感字段
    simplifiedTokenStructure: process.env.FEATURE_SIMPLIFIED_TOKEN !== 'false', // 默认启用
  },
});
