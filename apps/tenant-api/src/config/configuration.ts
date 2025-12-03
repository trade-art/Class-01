/**
 * 应用配置
 * 集中管理所有环境变量和配置项
 */

// 辅助函数：安全地解析整数环境变量
const parseIntEnv = (value: string | undefined, defaultValue: number): number =>
  value ? parseInt(value, 10) : defaultValue;

export default () => ({
  // 服务端口
  port: parseIntEnv(process.env.PORT, 3002),

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

  // 中间件服务配置
  middleware: {
    baseUrl:
      process.env.MIDDLEWARE_BASE_URL || 'http://localhost:3001/api/v1/mt5',
    timeout: parseIntEnv(process.env.MIDDLEWARE_TIMEOUT, 30000),
    retryAttempts: parseIntEnv(process.env.MIDDLEWARE_RETRY_ATTEMPTS, 3),
    retryDelay: parseIntEnv(process.env.MIDDLEWARE_RETRY_DELAY, 1000),
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
    bcryptRounds: parseIntEnv(process.env.BCRYPT_ROUNDS, 10),
    maxLoginAttempts: parseIntEnv(process.env.MAX_LOGIN_ATTEMPTS, 5),
    lockoutDuration: parseIntEnv(process.env.LOCKOUT_DURATION, 900), // 15 分钟
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
});
