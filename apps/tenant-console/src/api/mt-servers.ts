import { get, post, put, del } from './index'
import type {
  MtServer,
  CreateMtServerDto,
  UpdateMtServerDto,
  ConnectionTestResult,
  MtServerListResponse,
  MtServerQuota,
} from '@/types'

/**
 * MT 服务器 API 客户端
 *
 * 租户管理员可以管理自己的 MT 服务器配置。
 * 操作受租户订阅套餐限制（服务器数量、平台类型）。
 */
export const mtServersApi = {
  /**
   * 获取服务器列表
   */
  getServers(): Promise<MtServerListResponse> {
    return get<MtServerListResponse>('/tenant/mt-servers')
  },

  /**
   * 获取单个服务器详情
   */
  getServer(serverId: string): Promise<MtServer> {
    return get<MtServer>(`/tenant/mt-servers/${serverId}`)
  },

  /**
   * 获取配额信息
   */
  getQuota(): Promise<MtServerQuota> {
    return get<MtServerQuota>('/tenant/mt-servers/quota')
  },

  /**
   * 获取默认服务器
   */
  getDefaultServer(): Promise<MtServer | null> {
    return get<MtServer | null>('/tenant/mt-servers/default/server')
  },

  /**
   * 创建服务器
   */
  createServer(data: CreateMtServerDto): Promise<MtServer> {
    return post<MtServer>('/tenant/mt-servers', data)
  },

  /**
   * 更新服务器
   */
  updateServer(serverId: string, data: UpdateMtServerDto): Promise<MtServer> {
    return put<MtServer>(`/tenant/mt-servers/${serverId}`, data)
  },

  /**
   * 删除服务器
   */
  deleteServer(serverId: string): Promise<void> {
    return del<void>(`/tenant/mt-servers/${serverId}`)
  },

  /**
   * 测试服务器连接
   */
  testConnection(serverId: string): Promise<ConnectionTestResult> {
    return post<ConnectionTestResult>(`/tenant/mt-servers/${serverId}/test-connection`)
  },

  /**
   * 设置默认服务器
   */
  setDefault(serverId: string): Promise<MtServer> {
    return post<MtServer>(`/tenant/mt-servers/${serverId}/set-default`)
  },

  /**
   * 切换服务器状态
   */
  toggleStatus(serverId: string, isActive: boolean): Promise<MtServer> {
    return post<MtServer>(`/tenant/mt-servers/${serverId}/toggle-status`, { isActive })
  },
}
