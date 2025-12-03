import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/api'

interface User {
  id: string
  email: string
  name: string
  role: string
  userType: string
  tenantId?: string
  tenantCode?: string
  isActive?: boolean
  lastLoginAt?: string
  createdAt?: string
  updatedAt?: string
}

export const useUserStore = defineStore('user', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  const refreshToken = ref<string | null>(localStorage.getItem('refreshToken'))
  const user = ref<User | null>(null)

  const isLoggedIn = computed(() => !!token.value)
  const isPlatformAdmin = computed(() => user.value?.userType === 'platform_admin')

  async function login(email: string, password: string, userType: string, tenantCode?: string) {
    const response = await api.auth.login({ email, password, userType, tenantCode })

    token.value = response.accessToken
    refreshToken.value = response.refreshToken
    user.value = response.user

    localStorage.setItem('token', response.accessToken)
    localStorage.setItem('refreshToken', response.refreshToken)

    return response
  }

  async function fetchProfile() {
    if (!token.value) return null

    try {
      const profile = await api.auth.getProfile()
      user.value = profile
      return profile
    } catch (error) {
      logout()
      throw error
    }
  }

  function logout() {
    token.value = null
    refreshToken.value = null
    user.value = null

    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
  }

  async function refreshAccessToken() {
    if (!refreshToken.value) {
      logout()
      return false
    }

    try {
      const response = await api.auth.refresh(refreshToken.value)
      token.value = response.accessToken
      refreshToken.value = response.refreshToken

      localStorage.setItem('token', response.accessToken)
      localStorage.setItem('refreshToken', response.refreshToken)

      return true
    } catch {
      logout()
      return false
    }
  }

  return {
    token,
    refreshToken,
    user,
    isLoggedIn,
    isPlatformAdmin,
    login,
    logout,
    fetchProfile,
    refreshAccessToken,
  }
}, {
  persist: {
    paths: ['token', 'refreshToken', 'user'],
  },
})
