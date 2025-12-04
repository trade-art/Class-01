import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'

// Create axios instance with custom response type that returns data directly
const request: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
})

// Response types
export interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    email: string
    name: string
    role: string
    userType: string
    tenantId?: string
    tenantCode?: string
  }
}

export interface RefreshResponse {
  accessToken: string
  refreshToken: string
}

// Request interceptor
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor
request.interceptors.response.use(
  (response) => {
    // Handle wrapped response format: { success: true, data: {...} }
    const data = response.data
    if (data && typeof data === 'object' && 'success' in data && 'data' in data) {
      return data.data
    }
    return data
  },
  async (error) => {
    const originalUrl = error.config?.url || ''

    // Don't redirect on login page 401 errors - let the login page handle it
    if (error.response?.status === 401 && !originalUrl.includes('/auth/login')) {
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
      window.location.href = '/login'
    }

    // Extract error message from response
    // Backend format: { success: false, error: { code, message, ... } }
    const errorData = error.response?.data
    const errorMessage = errorData?.error?.message || errorData?.message || error.message || 'Request failed'

    return Promise.reject(new Error(errorMessage))
  }
)

export const api = {
  auth: {
    login: (data: { email: string; password: string; userType: string; tenantCode?: string }) =>
      request.post<any, LoginResponse>('/auth/login', data),
    refresh: (refreshToken: string) =>
      request.post<any, RefreshResponse>('/auth/refresh', { refreshToken }),
    getProfile: () => request.get<any, any>('/auth/me'),
  },

  tenants: {
    list: (params?: any) => request.get<any, any>('/tenants', { params }),
    get: (id: string) => request.get<any, any>(`/tenants/${id}`),
    create: (data: any) => request.post<any, any>('/tenants', data),
    update: (id: string, data: any) => request.patch<any, any>(`/tenants/${id}`, data),
    delete: (id: string) => request.delete<any, any>(`/tenants/${id}`),
    activate: (id: string) => request.post<any, any>(`/tenants/${id}/activate`),
    suspend: (id: string) => request.post<any, any>(`/tenants/${id}/suspend`),
    getStats: () => request.get<any, any>('/tenants/stats'),
  },

  instances: {
    list: (params?: any) => request.get<any, any>('/instances', { params }),
    get: (id: string) => request.get<any, any>(`/instances/${id}`),
    create: (data: any) => request.post<any, any>('/instances', data),
    update: (id: string, data: any) => request.patch<any, any>(`/instances/${id}`, data),
    delete: (id: string) => request.delete<any, any>(`/instances/${id}`),
    getByTenant: (tenantId: string) => request.get<any, any>(`/instances/tenant/${tenantId}`),
    regenerateKey: (id: string) => request.post<any, any>(`/instances/${id}/regenerate-key`),
    healthCheck: (id: string) => request.post<any, any>(`/instances/${id}/health-check`),
    getStats: () => request.get<any, any>('/instances/stats'),
  },

  platformAdmins: {
    list: () => request.get<any, any>('/platform-admins'),
    get: (id: string) => request.get<any, any>(`/platform-admins/${id}`),
    create: (data: any) => request.post<any, any>('/platform-admins', data),
    update: (id: string, data: any) => request.patch<any, any>(`/platform-admins/${id}`, data),
    delete: (id: string) => request.delete<any, any>(`/platform-admins/${id}`),
    changePasswordById: (id: string, data: any) =>
      request.post<any, any>(`/platform-admins/${id}/change-password`, data),
    resetPassword: (id: string, data: any) =>
      request.post<any, any>(`/platform-admins/${id}/reset-password`, data),
    updateProfile: (data: any) => request.patch<any, any>('/platform-admins/profile', data),
    changePassword: (data: any) => request.post<any, any>('/platform-admins/profile/change-password', data),
  },

  subscriptions: {
    list: (params?: any) => request.get<any, any>('/subscriptions', { params }),
    get: (id: string) => request.get<any, any>(`/subscriptions/${id}`),
    create: (data: any) => request.post<any, any>('/subscriptions', data),
    update: (id: string, data: any) => request.patch<any, any>(`/subscriptions/${id}`, data),
    delete: (id: string) => request.delete<any, any>(`/subscriptions/${id}`),
  },

  tenantAdmins: {
    list: (tenantId: string, params?: any) => request.get<any, any>(`/tenants/${tenantId}/admins`, { params }),
    get: (tenantId: string, adminId: string) => request.get<any, any>(`/tenants/${tenantId}/admins/${adminId}`),
    create: (tenantId: string, data: any) => request.post<any, any>(`/tenants/${tenantId}/admins`, data),
    update: (tenantId: string, adminId: string, data: any) => request.patch<any, any>(`/tenants/${tenantId}/admins/${adminId}`, data),
    delete: (tenantId: string, adminId: string) => request.delete<any, any>(`/tenants/${tenantId}/admins/${adminId}`),
    resetPassword: (tenantId: string, adminId: string, data: any) => request.post<any, any>(`/tenants/${tenantId}/admins/${adminId}/reset-password`, data),
  },

  invoices: {
    list: (params?: any) => request.get<any, any>('/invoices', { params }),
    get: (id: string) => request.get<any, any>(`/invoices/${id}`),
    markPaid: (id: string) => request.post<any, any>(`/invoices/${id}/mark-paid`),
    cancel: (id: string) => request.post<any, any>(`/invoices/${id}/cancel`),
    getStats: () => request.get<any, any>('/invoices/stats'),
  },

  tradingData: {
    getOverview: (params?: any) => request.get<any, any>('/trading-data/overview', { params }),
    getTenantRanking: (params?: any) => request.get<any, any>('/trading-data/tenant-ranking', { params }),
    getSymbolDistribution: (params?: any) => request.get<any, any>('/trading-data/symbol-distribution', { params }),
    getTenantDetail: (tenantId: string, params?: any) => request.get<any, any>(`/trading-data/tenant/${tenantId}`, { params }),
  },
}

export default request
