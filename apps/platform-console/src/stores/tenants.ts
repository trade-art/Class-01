import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/api'

export interface Tenant {
  id: string
  name: string
  code: string
  email: string
  phone?: string
  company?: string
  status: 'active' | 'pending' | 'suspended' | 'expired' | 'cancelled'
  plan: string
  maxInstances: number
  maxAdmins: number
  whitelabelConfig?: {
    logoUrl?: string
    primaryColor?: string
    companyName?: string
  }
  createdAt: string
  updatedAt: string
}

export interface TenantFilters {
  search: string
  status: string | null
}

export const useTenantsStore = defineStore('tenants', () => {
  const tenants = ref<Tenant[]>([])
  const loading = ref(false)
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(10)

  const filters = ref<TenantFilters>({
    search: '',
    status: null,
  })

  const activeTenants = computed(() =>
    tenants.value.filter((t) => t.status === 'active')
  )

  const pendingTenants = computed(() =>
    tenants.value.filter((t) => t.status === 'pending')
  )

  async function fetchTenants() {
    loading.value = true
    try {
      const params: any = {
        page: page.value,
        limit: pageSize.value,
      }

      if (filters.value.search) params.search = filters.value.search
      if (filters.value.status) params.status = filters.value.status

      const result = await api.tenants.list(params)
      tenants.value = Array.isArray(result) ? result : (result.data || [])
      total.value = result.total || tenants.value.length
    } catch {
      tenants.value = []
    } finally {
      loading.value = false
    }
  }

  async function getTenant(id: string): Promise<Tenant | null> {
    try {
      return await api.tenants.get(id)
    } catch {
      return null
    }
  }

  async function createTenant(data: Partial<Tenant>) {
    const result = await api.tenants.create(data)
    await fetchTenants()
    return result
  }

  async function updateTenant(id: string, data: Partial<Tenant>) {
    const result = await api.tenants.update(id, data)
    await fetchTenants()
    return result
  }

  async function deleteTenant(id: string) {
    await api.tenants.delete(id)
    await fetchTenants()
  }

  async function activateTenant(id: string) {
    await api.tenants.activate(id)
    await fetchTenants()
  }

  async function suspendTenant(id: string) {
    await api.tenants.suspend(id)
    await fetchTenants()
  }

  function setFilters(newFilters: Partial<TenantFilters>) {
    filters.value = { ...filters.value, ...newFilters }
    page.value = 1
  }

  function resetFilters() {
    filters.value = {
      search: '',
      status: null,
    }
    page.value = 1
  }

  function setPage(newPage: number) {
    page.value = newPage
  }

  function setPageSize(newSize: number) {
    pageSize.value = newSize
    page.value = 1
  }

  return {
    tenants,
    loading,
    total,
    page,
    pageSize,
    filters,
    activeTenants,
    pendingTenants,
    fetchTenants,
    getTenant,
    createTenant,
    updateTenant,
    deleteTenant,
    activateTenant,
    suspendTenant,
    setFilters,
    resetFilters,
    setPage,
    setPageSize,
  }
})
