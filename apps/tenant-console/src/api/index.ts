import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/auth'
import router from '@/router'

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

const api: AxiosInstance = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const authStore = useAuthStore()

    // Add auth token
    if (authStore.accessToken) {
      config.headers.Authorization = `Bearer ${authStore.accessToken}`
    }

    // Add tenant code header for multi-tenant support
    if (authStore.tenant?.code) {
      config.headers['X-Tenant-Code'] = authStore.tenant.code
    }

    return config
  },
  (error: AxiosError) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
    const originalUrl = originalRequest?.url || ''

    // Handle 401 Unauthorized - skip redirect for login page
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't redirect on login page 401 errors - let the login page handle it
      if (originalUrl.includes('/auth/login')) {
        const errorData = error.response?.data as any
        const errorMessage = errorData?.error?.message || errorData?.message || '登录失败'
        return Promise.reject(new Error(errorMessage))
      }

      originalRequest._retry = true

      const authStore = useAuthStore()

      // Try to refresh token
      if (authStore.refreshToken) {
        try {
          const response = await axios.post(`${baseURL}/tenant/auth/refresh`, {
            refreshToken: authStore.refreshToken,
          })

          // 解包后端响应格式: { success: true, data: {...} }
          const responseData = response.data?.data || response.data
          const { accessToken, refreshToken } = responseData
          authStore.setTokens(accessToken, refreshToken)

          // Retry original request
          originalRequest.headers.Authorization = `Bearer ${accessToken}`
          return api(originalRequest)
        } catch (refreshError) {
          // Refresh failed, logout
          authStore.logout()
          router.push('/login')
          return Promise.reject(refreshError)
        }
      } else {
        // No refresh token, logout
        authStore.logout()
        router.push('/login')
      }
    }

    // Extract error message from response
    // Backend format: { success: false, error: { code, message, ... } }
    const errorData = error.response?.data as any
    const errorMessage = errorData?.error?.message || errorData?.message || error.message || '请求失败'

    return Promise.reject(new Error(errorMessage))
  }
)

export default api

// Helper to unwrap response format: { success: true, data: {...} }
function unwrapResponse<T>(data: any): T {
  if (data && typeof data === 'object' && 'success' in data && 'data' in data) {
    return data.data
  }
  return data
}

// Export typed request methods
export const get = <T>(url: string, params?: any) =>
  api.get<T>(url, { params }).then((res) => unwrapResponse<T>(res.data))

export const post = <T>(url: string, data?: any, config?: any) =>
  api.post<T>(url, data, config).then((res) => unwrapResponse<T>(res.data))

export const put = <T>(url: string, data?: any) =>
  api.put<T>(url, data).then((res) => unwrapResponse<T>(res.data))

export const patch = <T>(url: string, data?: any) =>
  api.patch<T>(url, data).then((res) => unwrapResponse<T>(res.data))

export const del = <T>(url: string) =>
  api.delete<T>(url).then((res) => unwrapResponse<T>(res.data))
