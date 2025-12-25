import * as Joi from 'joi';

/**
 * 环境变量验证 Schema
 * 确保所有必需的环境变量都已正确配置
 */
export const validationSchema = Joi.object({
  // 基础配置
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3200),
  API_PREFIX: Joi.string().default('tenant'),

  // 数据库配置 (必需)
  DATABASE_URL: Joi.string().required().messages({
    'any.required': 'DATABASE_URL 是必需的环境变量',
  }),

  // JWT 配置
  JWT_SECRET: Joi.string().min(32).required().messages({
    'any.required': 'JWT_SECRET 是必需的环境变量',
    'string.min': 'JWT_SECRET 长度至少需要 32 个字符',
  }),
  JWT_EXPIRES_IN: Joi.string().default('24h'),
  JWT_REFRESH_SECRET: Joi.string().min(32).optional(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // 中间件服务配置
  MIDDLEWARE_BASE_URL: Joi.string()
    .uri()
    .default('http://localhost:3001/api/v1/mt5'),
  MIDDLEWARE_TIMEOUT: Joi.number().default(30000),
  MIDDLEWARE_RETRY_ATTEMPTS: Joi.number().default(3),
  MIDDLEWARE_RETRY_DELAY: Joi.number().default(1000),

  // Redis 配置
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),
  REDIS_DB: Joi.number().default(1),
  REDIS_TTL: Joi.number().default(300),

  // 缓存 TTL 配置
  CACHE_QUOTES_TTL: Joi.number().default(5),
  CACHE_POSITIONS_TTL: Joi.number().default(10),
  CACHE_ACCOUNTS_TTL: Joi.number().default(60),
  CACHE_SYMBOLS_TTL: Joi.number().default(300),
  CACHE_DEFAULT_TTL: Joi.number().default(60),

  // WebSocket 配置
  WS_PORT: Joi.number().default(3003),
  WS_PING_INTERVAL: Joi.number().default(30000),
  WS_PING_TIMEOUT: Joi.number().default(5000),

  // 日志配置
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug', 'verbose')
    .default('info'),
  LOG_FORMAT: Joi.string().valid('json', 'pretty').default('json'),

  // 安全配置
  BCRYPT_ROUNDS: Joi.number().min(8).max(14).default(10),
  MAX_LOGIN_ATTEMPTS: Joi.number().default(5),
  LOCKOUT_DURATION: Joi.number().default(900),

  // 风控配置
  RISK_CHECK_INTERVAL: Joi.number().default(60000),
  RISK_ALERT_RETENTION_DAYS: Joi.number().default(30),

  // 报表配置
  REPORTS_MAX_EXPORT_ROWS: Joi.number().default(10000),
  REPORTS_DEFAULT_PAGE_SIZE: Joi.number().default(20),
});

/**
 * 验证选项
 */
export const validationOptions = {
  // 允许未知的环境变量
  allowUnknown: true,
  // 移除未知的环境变量 (不传递给应用)
  stripUnknown: false,
  // 验证失败时抛出错误
  abortEarly: false,
};
