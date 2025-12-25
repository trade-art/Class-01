/**
 * 中间件健康检查相关接口定义
 * middleware-integration Task 5/6/7
 *
 * 与 MT5-middleware HealthController.cpp 响应格式对齐
 */

export type InstanceStatus = 'ONLINE' | 'OFFLINE' | 'ERROR' | 'DEGRADED' | 'MAINTENANCE';

/**
 * MT5-middleware /health/detailed 响应格式
 */
export interface MiddlewareHealth {
  /** 服务名称 */
  service: string;
  /** 版本号 */
  version: string;
  /** Unix 时间戳（秒） */
  timestamp: number;
  /** 检查者标识 */
  checked_by?: string;
  /** 运行时长（秒） */
  uptime_seconds?: number;
  /** 整体健康状态 */
  status: 'healthy' | 'unhealthy' | 'degraded';
  /** 组件健康状态 (mt5, redis, database) */
  components?: MiddlewareComponents;
  /** 熔断器状态列表 */
  circuit_breakers?: CircuitBreakerStatus[];
  /** 性能指标 */
  metrics?: HealthMetrics;
}

/**
 * 组件健康状态对象
 */
export interface MiddlewareComponents {
  mt5?: ComponentHealth;
  redis?: ComponentHealth;
  database?: ComponentHealth;
  [key: string]: ComponentHealth | undefined;
}

/**
 * 单个组件健康状态
 */
export interface ComponentHealth {
  /** 组件名称 */
  name: string;
  /** 组件状态 */
  status: 'healthy' | 'unhealthy' | 'unknown';
  /** 响应延迟（毫秒） */
  latency_ms?: number;
  /** 最后检查时间 */
  last_check?: number;
  /** 错误信息 */
  error?: string;
  /** 额外详情 */
  details?: Record<string, any>;
}

/**
 * 熔断器状态
 */
export interface CircuitBreakerStatus {
  /** 服务名称 */
  service: string;
  /** 熔断器状态 */
  state: 'closed' | 'open' | 'half_open';
  /** 失败次数 */
  failures: number;
  /** 最后失败时间 */
  last_failure?: number;
  /** 状态变更时间 */
  last_state_change?: number;
}

/**
 * 健康检查性能指标
 */
export interface HealthMetrics {
  /** CPU 使用率 (%) */
  cpu_usage_percent?: number;
  /** 内存使用 (MB) */
  memory_usage_mb?: number;
  /** 内存使用率 (%) */
  memory_usage_percent?: number;
  /** 硬盘使用 (GB) */
  disk_usage_gb?: number;
  /** 硬盘使用率 (%) */
  disk_usage_percent?: number;
  /** 硬盘总容量 (GB) */
  disk_total_gb?: number;
  /** 连接统计 */
  connections?: {
    total: number;
    websocket: number;
    http: number;
  };
  /** 吞吐量统计 */
  throughput?: {
    api_calls_per_second: number;
    messages_per_second?: number;
  };
  /** 错误统计 */
  errors?: {
    total: number;
    last_hour: number;
  };
}

export interface HealthCheckResult {
  instanceId: string;
  status: InstanceStatus;
  latencyMs: number;
  data: MiddlewareHealth | null;
  errorMessage?: string;
  checkedAt: Date;
}

export interface HealthSummary {
  total: number;
  online: number;
  offline: number;
  error: number;
  degraded: number;
  lastUpdated: Date;
}

/**
 * 中间件实例信息 (用于 HTTP 请求)
 */
export interface MiddlewareInstanceInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  apiKey: string;
  useTls: boolean;
  status: InstanceStatus;
  circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  consecutiveFailures: number;
  tenantId: string;
}
