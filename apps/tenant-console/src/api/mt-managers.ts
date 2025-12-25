import { get, post, put, del } from './index'
import type {
  MtManager,
  CreateMtManagerDto,
  UpdateMtManagerDto,
  ConnectionTestResult,
  MtManagerListResponse,
  MtManagerApiKeyStatus,
  GenerateMtManagerApiKeyResponse,
  GetMtManagerApiSecretResponse,
  AvailableScopesResponse,
  GenerateMtManagerApiKeyDto,
} from '@/types'

/**
 * MT 经理账号 API 客户端
 *
 * 租户管理员可以管理 MT 经理账号配置。
 * 一个 MT 服务器可以配置多个经理账号。
 */
export const mtManagersApi = {
  /**
   * 获取经理账号列表
   */
  getManagers(): Promise<MtManagerListResponse> {
    return get<MtManagerListResponse>('/tenant/mt-managers')
  },

  /**
   * 获取单个经理账号详情
   */
  getManager(id: string): Promise<MtManager> {
    return get<MtManager>(`/tenant/mt-managers/${id}`)
  },

  /**
   * 创建经理账号
   */
  createManager(data: CreateMtManagerDto): Promise<MtManager> {
    return post<MtManager>('/tenant/mt-managers', data)
  },

  /**
   * 更新经理账号
   */
  updateManager(id: string, data: UpdateMtManagerDto): Promise<MtManager> {
    return put<MtManager>(`/tenant/mt-managers/${id}`, data)
  },

  /**
   * 删除经理账号
   */
  deleteManager(id: string): Promise<void> {
    return del<void>(`/tenant/mt-managers/${id}`)
  },

  /**
   * 测试连接
   */
  testConnection(id: string): Promise<ConnectionTestResult> {
    return post<ConnectionTestResult>(`/tenant/mt-managers/${id}/test-connection`)
  },

  /**
   * 设置为默认账号
   */
  setDefault(id: string): Promise<MtManager> {
    return post<MtManager>(`/tenant/mt-managers/${id}/set-default`)
  },

  /**
   * 切换账号状态
   */
  toggleStatus(id: string, isActive: boolean): Promise<MtManager> {
    return post<MtManager>(`/tenant/mt-managers/${id}/toggle-status`, { isActive })
  },

  // ==================== API Key 管理 ====================

  /**
   * 获取 API Key 状态
   */
  getApiKeyStatus(managerId: string): Promise<MtManagerApiKeyStatus> {
    return get<MtManagerApiKeyStatus>(`/tenant/mt-managers/${managerId}/api-key`)
  },

  /**
   * 获取 API Secret
   * 用于管理界面显示（需要 owner 或 admin 权限）
   */
  getApiSecret(managerId: string): Promise<GetMtManagerApiSecretResponse> {
    return get<GetMtManagerApiSecretResponse>(`/tenant/mt-managers/${managerId}/api-key/secret`)
  },

  /**
   * 生成 API Key
   * 注意：返回的 apiSecret 仅显示一次，请妥善保存
   * @param managerId 经理账号 ID
   * @param data 可选参数，包含作用域设置
   */
  generateApiKey(managerId: string, data?: GenerateMtManagerApiKeyDto): Promise<GenerateMtManagerApiKeyResponse> {
    return post<GenerateMtManagerApiKeyResponse>(`/tenant/mt-managers/${managerId}/api-key`, data || {})
  },

  /**
   * 吊销 API Key
   */
  revokeApiKey(managerId: string): Promise<void> {
    return del<void>(`/tenant/mt-managers/${managerId}/api-key`)
  },

  /**
   * 启用/禁用 API Key
   */
  toggleApiKey(managerId: string, enabled: boolean): Promise<void> {
    return post<void>(`/tenant/mt-managers/${managerId}/api-key/toggle`, { enabled })
  },

  /**
   * 更新 API Key IP 白名单
   */
  updateAllowedIps(managerId: string, allowedIps: string[]): Promise<void> {
    return put<void>(`/tenant/mt-managers/${managerId}/api-key/allowed-ips`, { allowedIps })
  },

  /**
   * 获取可用的作用域列表
   */
  getAvailableScopes(): Promise<AvailableScopesResponse> {
    return get<AvailableScopesResponse>('/tenant/mt-managers/api-key/available-scopes')
  },

  /**
   * 更新 API Key 作用域
   */
  updateScopes(managerId: string, scopes: string[]): Promise<void> {
    return put<void>(`/tenant/mt-managers/${managerId}/api-key/scopes`, { scopes })
  },
}
