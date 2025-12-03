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

export const usersApi = {
  getList(params: Partial<UserListParams>): Promise<PaginatedResponse<TradingUser>> {
    return get<PaginatedResponse<TradingUser>>('/tenant/users', params)
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
    return get(`/tenant/users/${login}/transactions`, params || { page: 1, pageSize: 50 })
  },

  getLogs(login: number | string, params?: Partial<PaginationParams>): Promise<PaginatedResponse<any>> {
    return get(`/tenant/users/${login}/logs`, params || { page: 1, pageSize: 50 })
  },

  exportCsv(params: Omit<UserListParams, 'page' | 'pageSize'>): Promise<Blob> {
    return post('/tenant/users/export', params, {
      responseType: 'blob',
    } as any)
  },

  getUserDeposits(login: number | string, params?: Partial<PaginationParams>): Promise<PaginatedResponse<any>> {
    return get(`/tenant/users/${login}/deposits`, params || { page: 1, pageSize: 50 })
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
