import request from './index'

// Types
export type MiddlewareStatus = 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'UNKNOWN'
export type MiddlewareAssignmentMode = 'SHARED' | 'DEDICATED'
export type PlatformType = 'MT4' | 'MT5'

export interface MiddlewareHealthInfo {
  cpuUsage?: number           // CPU 使用率 (%)
  memoryUsage?: number        // 内存使用 (MB)
  memoryTotal?: number        // 内存总容量 (MB)
  memoryUsagePercent?: number // 内存使用率 (%)
  diskUsage?: number          // 硬盘使用 (GB)
  diskUsagePercent?: number   // 硬盘使用率 (%)
  diskTotal?: number          // 硬盘总容量 (GB)
}

export interface Middleware {
  id: string
  name: string
  description?: string
  url: string
  platformType: PlatformType
  assignmentMode: MiddlewareAssignmentMode
  maxTenants: number
  status: MiddlewareStatus
  serverIp?: string
  activeSessions?: number
  memoryUsage?: number // 系统级内存使用量 (MB)
  memoryTotal?: number // 系统级内存总容量 (MB)
  memoryUsagePercent?: number // 系统级内存使用率 (%)
  processMemory?: number // 进程级内存使用量 (MB)
  cpuUsage?: number // 系统级 CPU 使用率 (%)
  processCpuUsage?: number // 进程级 CPU 使用率 (%)
  diskUsage?: number
  diskUsagePercent?: number
  diskTotal?: number
  cacheHitRate?: number
  cacheStatus?: Record<string, unknown>
  lastHeartbeat?: string
  assignedTenantCount: number
  createdAt: string
  updatedAt: string
  healthInfo?: MiddlewareHealthInfo
}

export interface CreateMiddlewareDto {
  name: string
  description?: string
  url?: string  // 可选，中间件注册时自动填充
  serverIp?: string  // 可选，中间件注册时自动填充
  platformType?: PlatformType
  assignmentMode?: MiddlewareAssignmentMode
  maxTenants?: number
}

export interface UpdateMiddlewareDto {
  name?: string
  description?: string
  url?: string
  serverIp?: string
  platformType?: PlatformType
  assignmentMode?: MiddlewareAssignmentMode
  maxTenants?: number
}

export interface MiddlewareHealthResponse {
  id: string
  name: string
  status: MiddlewareStatus
  serverIp?: string
  activeSessions?: number
  memoryUsage?: number
  cpuUsage?: number
  cacheHitRate?: number
  lastHeartbeat?: string
}

export interface MiddlewareCapacity {
  id: string
  name: string
  assignmentMode: string
  maxTenants: number
  currentTenants: number
  availableSlots: number
  canAssign: boolean
}

export interface MiddlewareCreateResponse extends Middleware {
  registrationSecret: string  // 注册密钥，仅创建时返回
}

// 中间件运行时配置
export interface MiddlewareConfig {
  id: string
  middlewareId: string
  // Rate Limit
  rateLimitEnabled: boolean
  rateLimitRequestsPerMin: number
  rateLimitBurstSize: number
  // Circuit Breaker
  circuitBreakerEnabled: boolean
  circuitBreakerFailureThreshold: number
  circuitBreakerOpenTimeoutSec: number
  circuitBreakerHalfOpenRequests: number
  // Retry
  retryEnabled: boolean
  retryMaxRetries: number
  retryBaseDelayMs: number
  retryMaxDelayMs: number
  // Cache TTL
  cacheUserTtl: number
  cacheQuoteTtl: number
  cacheBalanceTtl: number
  cacheSymbolTtl: number
  cacheBarsTtl: number
  // WebSocket
  wsHeartbeatIntervalSec: number
  wsPingTimeoutSec: number
  wsMaxConnections: number
  // CORS
  corsEnabled: boolean
  corsAllowedOrigins: string
  corsAllowedMethods: string
  // Security
  securityMaxLoginAttempts: number
  securityLockoutDurationMin: number
  securitySessionTimeoutMin: number
  // Request Queue
  requestQueueEnabled: boolean
  requestQueueMaxSize: number
  requestQueueTimeoutMs: number
  requestQueueWorkerCount: number
  // Batch
  batchConcurrencyLimit: number
  createdAt: string
  updatedAt: string
}

export interface UpdateMiddlewareConfigDto {
  // Rate Limit
  rateLimitEnabled?: boolean
  rateLimitRequestsPerMin?: number
  rateLimitBurstSize?: number
  // Circuit Breaker
  circuitBreakerEnabled?: boolean
  circuitBreakerFailureThreshold?: number
  circuitBreakerOpenTimeoutSec?: number
  circuitBreakerHalfOpenRequests?: number
  // Retry
  retryEnabled?: boolean
  retryMaxRetries?: number
  retryBaseDelayMs?: number
  retryMaxDelayMs?: number
  // Cache TTL
  cacheUserTtl?: number
  cacheQuoteTtl?: number
  cacheBalanceTtl?: number
  cacheSymbolTtl?: number
  cacheBarsTtl?: number
  // WebSocket
  wsHeartbeatIntervalSec?: number
  wsPingTimeoutSec?: number
  wsMaxConnections?: number
  // CORS
  corsEnabled?: boolean
  corsAllowedOrigins?: string
  corsAllowedMethods?: string
  // Security
  securityMaxLoginAttempts?: number
  securityLockoutDurationMin?: number
  securitySessionTimeoutMin?: number
  // Request Queue
  requestQueueEnabled?: boolean
  requestQueueMaxSize?: number
  requestQueueTimeoutMs?: number
  requestQueueWorkerCount?: number
  // Batch
  batchConcurrencyLimit?: number
}

// API functions
export const middlewareApi = {
  // List all middlewares (backend returns array, interceptor extracts from { success, data })
  // Note: Backend doesn't support page/limit pagination
  list: (params?: { status?: string; assignmentMode?: string }) =>
    request.get<any, Middleware[]>('/middlewares', { params }),

  // Get single middleware
  get: (id: string) =>
    request.get<any, Middleware>(`/middlewares/${id}`),

  // Create middleware (returns API key once)
  create: (data: CreateMiddlewareDto) =>
    request.post<any, MiddlewareCreateResponse>('/middlewares', data),

  // Update middleware
  update: (id: string, data: UpdateMiddlewareDto) =>
    request.patch<any, Middleware>(`/middlewares/${id}`, data),

  // Delete middleware
  delete: (id: string) =>
    request.delete<any, void>(`/middlewares/${id}`),

  // Get health status
  getHealth: (id: string) =>
    request.get<any, MiddlewareHealthResponse>(`/middlewares/${id}/health`),

  // Test connection
  testConnection: (id: string) =>
    request.post<any, { success: boolean; message: string; latency?: number }>(`/middlewares/${id}/test`),

  // Regenerate registration secret
  regenerateRegistrationSecret: (id: string) =>
    request.post<any, { registrationSecret: string; message: string }>(`/middlewares/${id}/regenerate-secret`),

  // Get all middleware capacity
  getCapacity: () =>
    request.get<any, MiddlewareCapacity[]>('/middleware-assignments/capacity'),

  // Get available middlewares for assignment
  getAvailable: () =>
    request.get<any, MiddlewareCapacity[]>('/middleware-assignments/available'),

  // ============ 运行时配置 API ============

  // 获取运行时配置
  getConfig: (id: string) =>
    request.get<any, MiddlewareConfig>(`/middlewares/${id}/config`),

  // 更新运行时配置
  updateConfig: (id: string, data: UpdateMiddlewareConfigDto) =>
    request.patch<any, MiddlewareConfig>(`/middlewares/${id}/config`, data),

  // 重置运行时配置为默认值
  resetConfig: (id: string) =>
    request.post<any, MiddlewareConfig>(`/middlewares/${id}/config/reset`),
}

export default middlewareApi
