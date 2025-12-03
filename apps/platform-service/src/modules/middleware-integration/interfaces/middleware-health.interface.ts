/**
 * 中间件健康检查相关接口定义
 * middleware-integration Task 5/6
 */

export type InstanceStatus = 'ONLINE' | 'OFFLINE' | 'ERROR' | 'DEGRADED' | 'MAINTENANCE';

export interface MiddlewareHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  service: string;
  version: string;
  timestamp: string;
  instanceId?: string;
  uptime?: number;
  components?: ComponentHealth[];
  circuitBreakers?: CircuitBreakerStatus[];
}

export interface ComponentHealth {
  name: string;
  status: 'up' | 'down' | 'degraded';
  latencyMs?: number;
  details?: Record<string, any>;
}

export interface CircuitBreakerStatus {
  service: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  lastFailure?: string;
  lastStateChange?: string;
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
