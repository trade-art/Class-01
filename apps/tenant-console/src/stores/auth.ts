import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TenantAdmin, Tenant, TenantAdminRole } from '@/types'
import { authApi } from '@/api/auth'

export const useAuthStore = defineStore(
  'auth',
  () => {
    // State
    const accessToken = ref<string | null>(null)
    const refreshToken = ref<string | null>(null)
    const admin = ref<TenantAdmin | null>(null)
    const tenant = ref<Tenant | null>(null)

    // Alias for admin (backward compatibility)
    const user = computed(() => admin.value)

    // Getters
    const isLoggedIn = computed(() => !!accessToken.value && !!admin.value)
    const role = computed<TenantAdminRole | null>(() => admin.value?.role || null)
    const isOwner = computed(() => role.value === 'owner')
    const isAdmin = computed(() => role.value === 'owner' || role.value === 'admin')

    // Check if user has permission for an action
    const hasPermission = (requiredRole: TenantAdminRole): boolean => {
      if (!role.value) return false

      const roleHierarchy: Record<TenantAdminRole, number> = {
        owner: 3,
        admin: 2,
        operator: 1,
      }

      return roleHierarchy[role.value] >= roleHierarchy[requiredRole]
    }

    // Actions
    const setTokens = (access: string, refresh: string) => {
      accessToken.value = access
      refreshToken.value = refresh
    }

    const setAdmin = (adminData: TenantAdmin) => {
      admin.value = adminData
    }

    const setTenant = (tenantData: Tenant) => {
      tenant.value = tenantData
    }

    const login = async (email: string, password: string, tenantCode?: string, rememberMe: boolean = false) => {
      // tenantCode 在白标域名登录时可选，后端会根据请求域名自动识别租户
      const response = await authApi.login({ email, password, tenantCode, rememberMe })

      accessToken.value = response.accessToken
      refreshToken.value = response.refreshToken
      admin.value = response.admin
      tenant.value = response.tenant

      return response
    }

    const logout = async () => {
      try {
        await authApi.logout()
      } catch {
        // Ignore logout errors
      }

      accessToken.value = null
      refreshToken.value = null
      admin.value = null
      tenant.value = null
    }

    const refreshAuth = async () => {
      if (!refreshToken.value) {
        throw new Error('No refresh token')
      }

      const response = await authApi.refresh(refreshToken.value)
      accessToken.value = response.accessToken
      refreshToken.value = response.refreshToken

      return response
    }

    const updateProfile = async (data: { name?: string; email?: string }) => {
      const updated = await authApi.updateProfile(data)
      if (admin.value) {
        admin.value = { ...admin.value, ...data }
      }
      return updated
    }

    // Update user data locally (alias for updating admin)
    const updateUser = (data: Partial<TenantAdmin>) => {
      if (admin.value) {
        admin.value = { ...admin.value, ...data }
      }
    }

    const changePassword = async (currentPassword: string, newPassword: string) => {
      await authApi.changePassword({ currentPassword, newPassword })
    }

    return {
      // State
      accessToken,
      refreshToken,
      admin,
      tenant,
      user,

      // Getters
      isLoggedIn,
      role,
      isOwner,
      isAdmin,

      // Actions
      hasPermission,
      setTokens,
      setAdmin,
      setTenant,
      login,
      logout,
      refreshAuth,
      updateProfile,
      updateUser,
      changePassword,
    }
  },
  {
    persist: {
      key: 'tenant-auth',
      paths: ['accessToken', 'refreshToken', 'admin', 'tenant'],
    },
  }
)
