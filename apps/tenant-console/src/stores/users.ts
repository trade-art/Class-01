import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TradingUser } from '@/types'
import { usersApi, type UserListParams } from '@/api/users'

export const useUsersStore = defineStore('users', () => {
  // State
  const users = ref<TradingUser[]>([])
  const total = ref(0)
  const currentPage = ref(1)
  const pageSize = ref(20)
  const loading = ref(false)
  const groups = ref<string[]>([])

  // Current user detail
  const currentUser = ref<TradingUser | null>(null)
  const userLoading = ref(false)

  // Filters
  const searchQuery = ref('')
  const groupFilter = ref<string>('')
  const statusFilter = ref<string>('')
  const sortBy = ref<string>('login')
  const sortOrder = ref<'asc' | 'desc'>('asc')

  // Computed pagination object
  const pagination = computed(() => ({
    page: currentPage.value,
    pageSize: pageSize.value,
    pageCount: Math.ceil(total.value / pageSize.value),
    total: total.value,
  }))

  // Actions
  const loadUsers = async (params?: Partial<UserListParams>) => {
    loading.value = true
    try {
      const response = await usersApi.getList({
        page: params?.page || currentPage.value,
        pageSize: params?.pageSize || pageSize.value,
        search: params?.search ?? searchQuery.value,
        group: params?.group ?? groupFilter.value,
        status: params?.status ?? statusFilter.value,
        sortBy: params?.sortBy ?? sortBy.value,
        sortOrder: params?.sortOrder ?? sortOrder.value,
      })

      users.value = response.items
      total.value = response.total
      currentPage.value = response.page
      pageSize.value = response.pageSize

      return response
    } finally {
      loading.value = false
    }
  }

  // Alias for loadUsers
  const fetchUsers = loadUsers

  const loadGroups = async () => {
    try {
      groups.value = await usersApi.getGroups()
    } catch {
      groups.value = []
    }
  }

  const loadUserDetail = async (login: number) => {
    userLoading.value = true
    try {
      currentUser.value = await usersApi.getDetail(login)
      return currentUser.value
    } finally {
      userLoading.value = false
    }
  }

  const updateUserGroup = async (login: number, group: string) => {
    await usersApi.updateGroup(login, group)

    // Update local state
    const user = users.value.find((u) => u.login === login)
    if (user) {
      user.group = group
    }
    if (currentUser.value?.login === login) {
      currentUser.value.group = group
    }
  }

  const updateUserLeverage = async (login: number, leverage: number) => {
    await usersApi.updateLeverage(login, leverage)

    // Update local state
    const user = users.value.find((u) => u.login === login)
    if (user) {
      user.leverage = leverage
    }
    if (currentUser.value?.login === login) {
      currentUser.value.leverage = leverage
    }
  }

  const updateUserStatus = async (login: number, status: 'active' | 'disabled') => {
    await usersApi.updateStatus(login, status)

    // Update local state
    const user = users.value.find((u) => u.login === login)
    if (user) {
      user.status = status
    }
    if (currentUser.value?.login === login) {
      currentUser.value.status = status
    }
  }

  // Update user by id
  const updateUser = async (_id: string, data: any) => {
    const login = data.login as number
    if (data.group) {
      await updateUserGroup(login, data.group)
    }
    if (data.leverage) {
      await updateUserLeverage(login, data.leverage)
    }
    if (data.status) {
      await updateUserStatus(login, data.status)
    }
  }

  // Create user (placeholder - actual API may differ)
  const createUser = async (_data: any) => {
    // This would call a create user API if it exists
    // For now, just reload the list
    await loadUsers()
  }

  // Reset password
  const resetPassword = async (login: number | string) => {
    await usersApi.resetPassword(login)
  }

  // Suspend user
  const suspendUser = async (login: number | string) => {
    await usersApi.suspendUser(login)
    // Update local state
    const user = users.value.find((u) => u.login === login)
    if (user) {
      user.status = 'suspended'
    }
    if (currentUser.value?.login === login) {
      currentUser.value.status = 'suspended'
    }
  }

  // Activate user
  const activateUser = async (login: number | string) => {
    await usersApi.activateUser(login)
    // Update local state
    const user = users.value.find((u) => u.login === login)
    if (user) {
      user.status = 'active'
    }
    if (currentUser.value?.login === login) {
      currentUser.value.status = 'active'
    }
  }

  const setFilters = (filters: {
    search?: string
    group?: string
    status?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  }) => {
    if (filters.search !== undefined) searchQuery.value = filters.search
    if (filters.group !== undefined) groupFilter.value = filters.group
    if (filters.status !== undefined) statusFilter.value = filters.status
    if (filters.sortBy !== undefined) sortBy.value = filters.sortBy
    if (filters.sortOrder !== undefined) sortOrder.value = filters.sortOrder
  }

  const resetFilters = () => {
    searchQuery.value = ''
    groupFilter.value = ''
    statusFilter.value = ''
    sortBy.value = 'login'
    sortOrder.value = 'asc'
  }

  const clearCurrentUser = () => {
    currentUser.value = null
  }

  return {
    // State
    users,
    total,
    currentPage,
    pageSize,
    loading,
    groups,
    currentUser,
    userLoading,
    searchQuery,
    groupFilter,
    statusFilter,
    sortBy,
    sortOrder,
    pagination,

    // Actions
    loadUsers,
    fetchUsers,
    loadGroups,
    loadUserDetail,
    updateUserGroup,
    updateUserLeverage,
    updateUserStatus,
    updateUser,
    createUser,
    resetPassword,
    suspendUser,
    activateUser,
    setFilters,
    resetFilters,
    clearCurrentUser,
  }
})
