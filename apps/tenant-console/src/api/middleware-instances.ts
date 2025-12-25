import { get } from './index'

/**
 * 经理账号连接状态
 */
export type ManagerStatus = 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONFIGURED'

/**
 * 中间件实例类型定义
 */
export interface MiddlewareInstance {
  id: string
  name: string
  description?: string
  url: string
  platformType: 'MT5' | 'MT4'
  status: string
  serverIp?: string
  lastHeartbeat?: string
  activeSessions?: number
  memoryUsagePercent?: number
  cpuUsage?: number
  assignedAt: string
  /** 经理账号连接状态 */
  managerStatus: ManagerStatus
  /** 默认经理账号登录号 */
  defaultManagerLogin?: string
}

export interface MiddlewareInstanceListResponse {
  middlewares: MiddlewareInstance[]
  total: number
}

/**
 * 中间件实例 API 客户端
 *
 * 用于查询分配给当前租户的中间件实例信息。
 * 中间件实例在 SaaS 平台后台添加并分配给租户，租户只能查看。
 */
export const middlewareInstancesApi = {
  /**
   * 获取分配给当前租户的中间件实例列表
   */
  getInstances(): Promise<MiddlewareInstanceListResponse> {
    return get<MiddlewareInstanceListResponse>('/tenant/middleware-instances')
  },

  /**
   * 获取单个中间件实例详情
   */
  getInstance(id: string): Promise<MiddlewareInstance> {
    return get<MiddlewareInstance>(`/tenant/middleware-instances/${id}`)
  },
}
