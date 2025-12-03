import { get, post, put, del } from './index'
import type { TenantAdmin, TenantBranding, ApiKey, CreateApiKeyRequest, CreateApiKeyResponse, PaginatedResponse, PaginationParams } from '@/types'

export const settingsApi = {
  // Branding
  getBranding(): Promise<TenantBranding> {
    return get<TenantBranding>('/tenant/settings/branding')
  },

  updateBranding(data: Partial<TenantBranding>): Promise<void> {
    return put('/tenant/settings/branding', data)
  },

  uploadLogo(formData: FormData): Promise<{ url: string }> {
    return post('/tenant/settings/branding/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    } as any)
  },

  uploadFavicon(formData: FormData): Promise<{ url: string }> {
    return post('/tenant/settings/branding/favicon', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    } as any)
  },

  // Admins
  getAdmins(params?: Partial<PaginationParams>): Promise<PaginatedResponse<TenantAdmin>> {
    return get<PaginatedResponse<TenantAdmin>>('/tenant/settings/admins', params || { page: 1, pageSize: 50 })
  },

  createAdmin(data: { name: string; email: string; password: string; role: string }): Promise<TenantAdmin> {
    return post<TenantAdmin>('/tenant/settings/admins', data)
  },

  updateAdmin(id: string, data: { name?: string; email?: string; role?: string; status?: string }): Promise<void> {
    return put(`/tenant/settings/admins/${id}`, data)
  },

  resetAdminPassword(id: string, newPassword?: string): Promise<void> {
    return post(`/tenant/settings/admins/${id}/reset-password`, newPassword ? { newPassword } : {})
  },

  toggleAdminStatus(id: string, isActive: boolean): Promise<void> {
    return put(`/tenant/settings/admins/${id}/status`, { isActive })
  },

  deleteAdmin(id: string): Promise<void> {
    return del(`/tenant/settings/admins/${id}`)
  },

  // API Keys
  getApiKeys(params?: Partial<PaginationParams>): Promise<PaginatedResponse<ApiKey>> {
    return get<PaginatedResponse<ApiKey>>('/tenant/settings/api-keys', params || { page: 1, pageSize: 50 })
  },

  createApiKey(data: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
    return post<CreateApiKeyResponse>('/tenant/settings/api-keys', data)
  },

  updateApiKeyPermissions(id: string, permissions: string[]): Promise<void> {
    return put(`/tenant/settings/api-keys/${id}/permissions`, { permissions })
  },

  regenerateApiKey(id: string): Promise<{ key: string }> {
    return post(`/tenant/settings/api-keys/${id}/regenerate`)
  },

  toggleApiKeyStatus(id: string, isActive: boolean): Promise<void> {
    return put(`/tenant/settings/api-keys/${id}/status`, { isActive })
  },

  deleteApiKey(id: string): Promise<void> {
    return del(`/tenant/settings/api-keys/${id}`)
  },

  revokeApiKey(id: string): Promise<void> {
    return put(`/tenant/settings/api-keys/${id}/revoke`)
  },

  // Profile
  updateProfile(data: any): Promise<void> {
    return put('/tenant/settings/profile', data)
  },

  changePassword(data: { currentPassword: string; newPassword: string }): Promise<void> {
    return post('/tenant/settings/change-password', data)
  },

  logoutAllDevices(): Promise<void> {
    return post('/tenant/settings/logout-all')
  },

  // Notifications
  getNotificationSettings(): Promise<any> {
    return get('/tenant/settings/notifications')
  },

  updateNotificationSettings(data: any): Promise<void> {
    return put('/tenant/settings/notifications', data)
  },

  // MT5 Server Info (readonly)
  getMt5ServerInfo(): Promise<any> {
    return get('/tenant/settings/mt5-server')
  },
}
