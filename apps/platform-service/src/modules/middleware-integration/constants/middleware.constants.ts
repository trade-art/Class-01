/**
 * 中间件集成常量定义
 * middleware-integration Task 5/6
 */

// 健康检查配置
export const HEALTH_CHECK_CONFIG = {
  /** 健康检查间隔 (毫秒) */
  INTERVAL_MS: 60000, // 1 分钟
  /** 健康检查超时 (毫秒) */
  TIMEOUT_MS: 5000,
  /** 触发告警的连续失败次数 */
  ALERT_THRESHOLD: 3,
  /** 健康状态缓存 TTL (秒) */
  CACHE_TTL_SECONDS: 30,
} as const;

// 熔断器配置
export const CIRCUIT_BREAKER_CONFIG = {
  /** 触发熔断的失败次数 */
  FAILURE_THRESHOLD: 5,
  /** 恢复需要的成功次数 */
  SUCCESS_THRESHOLD: 3,
  /** 熔断持续时间 (毫秒) */
  OPEN_TIMEOUT_MS: 30000, // 30 秒
} as const;

// HTTP 客户端配置
export const HTTP_CLIENT_CONFIG = {
  /** 默认超时 (毫秒) */
  DEFAULT_TIMEOUT_MS: 5000,
  /** 最大重试次数 */
  MAX_RETRIES: 3,
  /** 初始重试延迟 (毫秒) */
  INITIAL_RETRY_DELAY_MS: 1000,
  /** 重试延迟倍数 (指数退避) */
  RETRY_MULTIPLIER: 2,
  /** 最大重试延迟 (毫秒) */
  MAX_RETRY_DELAY_MS: 10000,
} as const;

// 缓存键前缀
export const CACHE_KEYS = {
  /** 健康状态缓存 */
  HEALTH_STATUS: 'instance:health:',
  /** 实例信息缓存 */
  INSTANCE_INFO: 'instance:info:',
  /** 平台概览缓存 */
  PLATFORM_OVERVIEW: 'platform:overview',
  /** 租户概览缓存 */
  TENANT_OVERVIEW: 'tenant:overview:',
} as const;

// 缓存 TTL (秒)
export const CACHE_TTL = {
  /** 健康状态 TTL */
  HEALTH_STATUS: 30,
  /** 实例信息 TTL */
  INSTANCE_INFO: 300, // 5 分钟
  /** 平台概览 TTL */
  PLATFORM_OVERVIEW: 60,
  /** 租户概览 TTL */
  TENANT_OVERVIEW: 60,
} as const;

// Webhook 事件类型
export const WEBHOOK_EVENTS = {
  STATUS_CHANGE: 'status_change',
  CIRCUIT_BREAKER_OPEN: 'circuit_breaker_open',
  CIRCUIT_BREAKER_CLOSE: 'circuit_breaker_close',
  MT5_DISCONNECT: 'mt5_disconnect',
  MT5_RECONNECT: 'mt5_reconnect',
  ERROR: 'error',
  // 中间件特定事件 (mt5-middleware-integration Task 11)
  MT5_CONNECTED: 'mt5.connected',
  MT5_DISCONNECTED: 'mt5.disconnected',
  HEALTH_CHECK_FAILED: 'health.check_failed',
} as const;

// 事件严重级别
export const EVENT_SEVERITY = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL',
} as const;

// 中间件 API 路径
export const MIDDLEWARE_API_PATHS = {
  HEALTH: '/health',
  HEALTH_DETAILED: '/health/detailed',
  MONITOR_METRICS: '/api/v1/monitor/metrics',
  MONITOR_STATS: '/api/v1/monitor/stats',
  TRADING_HISTORY: '/api/v1/trading/history/orders',
  TRADING_POSITIONS: '/api/v1/trading/positions',
  TRADING_BALANCES: '/api/v1/accounts/balances',
  ADMIN_SERVERS: '/admin/servers',
  ADMIN_CONFIG: '/admin/config',
} as const;
