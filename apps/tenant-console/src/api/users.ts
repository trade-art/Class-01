import { get, post, put } from './index'
import type { TradingUser, PaginatedResponse, PaginationParams } from '@/types'

export interface UserListParams extends PaginationParams {
  search?: string
  keyword?: string
  group?: string
  status?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

// 转换前端分页参数为后端格式 (pageSize -> limit)
function convertPaginationParams<T extends Partial<PaginationParams>>(params: T): Omit<T, 'pageSize'> & { limit?: number } {
  const { pageSize, ...rest } = params as any
  return pageSize !== undefined ? { ...rest, limit: pageSize } : rest
}

export const usersApi = {
  getList(params: Partial<UserListParams>): Promise<PaginatedResponse<TradingUser>> {
    return get<PaginatedResponse<TradingUser>>('/tenant/users', convertPaginationParams(params))
  },

  getUser(login: number | string): Promise<TradingUser> {
    return get<TradingUser>(`/tenant/users/${login}`)
  },

  getDetail(login: number | string): Promise<TradingUser> {
    return get<TradingUser>(`/tenant/users/${login}`)
  },

  updateGroup(login: number | string, group: string): Promise<void> {
    return put(`/tenant/users/${login}/group`, { group })
  },

  updateLeverage(login: number | string, leverage: number): Promise<void> {
    return put(`/tenant/users/${login}/leverage`, { leverage })
  },

  updateStatus(login: number | string, status: 'active' | 'disabled'): Promise<void> {
    return put(`/tenant/users/${login}/status`, { status })
  },

  getGroups(): Promise<string[]> {
    return get<string[]>('/tenant/users/groups')
  },

  getTransactions(login: number | string, params?: Partial<PaginationParams>): Promise<PaginatedResponse<any>> {
    return get(`/tenant/users/${login}/transactions`, convertPaginationParams(params || { page: 1, pageSize: 50 }))
  },

  getLogs(login: number | string, params?: Partial<PaginationParams>): Promise<PaginatedResponse<any>> {
    return get(`/tenant/users/${login}/logs`, convertPaginationParams(params || { page: 1, pageSize: 50 }))
  },

  exportCsv(params: Omit<UserListParams, 'page' | 'pageSize'>): Promise<Blob> {
    return post('/tenant/users/export', params, {
      responseType: 'blob',
    } as any)
  },

  getUserDeposits(login: number | string, params?: Partial<PaginationParams>): Promise<PaginatedResponse<any>> {
    return get(`/tenant/users/${login}/deposits`, convertPaginationParams(params || { page: 1, pageSize: 50 }))
  },

  resetPassword(login: number | string): Promise<void> {
    return post(`/tenant/users/${login}/reset-password`)
  },

  suspendUser(login: number | string): Promise<void> {
    return put(`/tenant/users/${login}/suspend`)
  },

  activateUser(login: number | string): Promise<void> {
    return put(`/tenant/users/${login}/activate`)
  },
}
