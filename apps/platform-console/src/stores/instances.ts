import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/api'

export interface Instance {
  id: string
  name: string
  tenantId: string
  tenant?: { name: string; code: string }
  host: string
  port: number
  status: 'online' | 'offline' | 'maintenance' | 'error'
  version?: string
  apiKey?: string
  maxSessions: number
  maxManagers: number
  lastHealthCheck?: string
  healthData?: {
    uptime?: number
    activeSessions?: number
    totalConnections?: number
    memoryUsage?: number
  }
  mt5Servers?: {
    name: string
    host: string
    port: number
    isDefault: boolean
  }[]
  createdAt: string
  updatedAt: string
}

export interface InstanceFilters {
  search: string
  status: string | null
  tenantId: string | null
}

export const useInstancesStore = defineStore('instances', () => {
  const instances = ref<Instance[]>([])
  const loading = ref(false)
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(10)

  const filters = ref<InstanceFilters>({
    search: '',
    status: null,
    tenantId: null,
  })

  const onlineInstances = computed(() =>
    instances.value.filter((i) => i.status === 'online')
  )

  const offlineInstances = computed(() =>
    instances.value.filter((i) => i.status === 'offline')
  )

  async function fetchInstances() {
    loading.value = true
    try {
      const params: any = {
        page: page.value,
        limit: pageSize.value,
      }

      if (filters.value.search) params.search = filters.value.search
      if (filters.value.status) params.status = filters.value.status
      if (filters.value.tenantId) params.tenantId = filters.value.tenantId

      const result = await api.instances.list(params)
      instances.value = Array.isArray(result) ? result : (result.data || [])
      total.value = result.total || instances.value.length
    } catch {
      instances.value = []
    } finally {
      loading.value = false
    }
  }

  async function getInstance(id: string): Promise<Instance | null> {
    try {
      return await api.instances.get(id)
    } catch {
      return null
    }
  }

  async function getByTenant(tenantId: string): Promise<Instance[]> {
    try {
      const result = await api.instances.getByTenant(tenantId)
      return Array.isArray(result) ? result : (result.data || [])
    } catch {
      return []
    }
  }

  async function createInstance(data: Partial<Instance>) {
    const result = await api.instances.create(data)
    await fetchInstances()
    return result
  }

  async function updateInstance(id: string, data: Partial<Instance>) {
    const result = await api.instances.update(id, data)
    await fetchInstances()
    return result
  }

  async function deleteInstance(id: string) {
    await api.instances.delete(id)
    await fetchInstances()
  }

  async function regenerateKey(id: string) {
    const result = await api.instances.regenerateKey(id)
    return result
  }

  async function healthCheck(id: string) {
    const result = await api.instances.healthCheck(id)
    await fetchInstances()
    return result
  }

  function setFilters(newFilters: Partial<InstanceFilters>) {
    filters.value = { ...filters.value, ...newFilters }
    page.value = 1
  }

  function resetFilters() {
    filters.value = {
      search: '',
      status: null,
      tenantId: null,
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
    instances,
    loading,
    total,
    page,
    pageSize,
    filters,
    onlineInstances,
    offlineInstances,
    fetchInstances,
    getInstance,
    getByTenant,
    createInstance,
    updateInstance,
    deleteInstance,
    regenerateKey,
    healthCheck,
    setFilters,
    resetFilters,
    setPage,
    setPageSize,
  }
})
