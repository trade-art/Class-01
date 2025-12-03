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

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      const authStore = useAuthStore()

      // Try to refresh token
      if (authStore.refreshToken) {
        try {
          const response = await axios.post(`${baseURL}/auth/refresh`, {
            refreshToken: authStore.refreshToken,
          })

          const { accessToken, refreshToken } = response.data
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

    // Handle other errors
    return Promise.reject(error)
  }
)

export default api

// Export typed request methods
export const get = <T>(url: string, params?: any) =>
  api.get<T>(url, { params }).then((res) => res.data)

export const post = <T>(url: string, data?: any, config?: any) =>
  api.post<T>(url, data, config).then((res) => res.data)

export const put = <T>(url: string, data?: any) =>
  api.put<T>(url, data).then((res) => res.data)

export const patch = <T>(url: string, data?: any) =>
  api.patch<T>(url, data).then((res) => res.data)

export const del = <T>(url: string) =>
  api.delete<T>(url).then((res) => res.data)
