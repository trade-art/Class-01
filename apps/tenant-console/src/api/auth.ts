import { post } from './index'
import type { LoginRequest, LoginResponse, RefreshResponse } from '@/types'

export const authApi = {
  login(data: LoginRequest): Promise<LoginResponse> {
    return post<LoginResponse>('/tenant/auth/login', data)
  },

  refresh(refreshToken: string): Promise<RefreshResponse> {
    return post<RefreshResponse>('/tenant/auth/refresh', { refreshToken })
  },

  logout(): Promise<void> {
    return post('/tenant/auth/logout')
  },

  changePassword(data: { currentPassword: string; newPassword: string }): Promise<void> {
    return post('/tenant/auth/change-password', data)
  },

  getProfile(): Promise<any> {
    return post('/tenant/auth/profile')
  },

  updateProfile(data: { name?: string; email?: string }): Promise<any> {
    return post('/tenant/auth/profile', data)
  },
}
