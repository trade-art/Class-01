import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/api'

export interface Invoice {
  id: string
  invoiceNo: string
  tenantId: string
  tenant?: { name: string; code: string }
  amount: number
  status: string
  periodStart: string
  periodEnd: string
  dueDate: string
  paidAt?: string
  description?: string
  createdAt: string
}

export interface InvoiceFilters {
  search: string
  status: string | null
  startDate: string | null
  endDate: string | null
}

export const useInvoicesStore = defineStore('invoices', () => {
  const invoices = ref<Invoice[]>([])
  const loading = ref(false)
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(10)

  const filters = ref<InvoiceFilters>({
    search: '',
    status: null,
    startDate: null,
    endDate: null,
  })

  const stats = ref({
    total: 0,
    pending: 0,
    paid: 0,
    totalAmount: 0,
  })

  const pendingInvoices = computed(() =>
    invoices.value.filter((i) => i.status === 'pending')
  )

  const overdueInvoices = computed(() =>
    invoices.value.filter((i) => i.status === 'overdue')
  )

  async function fetchInvoices() {
    loading.value = true
    try {
      const params: any = {
        page: page.value,
        limit: pageSize.value,
      }

      if (filters.value.search) params.search = filters.value.search
      if (filters.value.status) params.status = filters.value.status
      if (filters.value.startDate) params.startDate = filters.value.startDate
      if (filters.value.endDate) params.endDate = filters.value.endDate

      const result = await api.invoices.list(params)
      invoices.value = Array.isArray(result) ? result : (result.data || [])
      total.value = result.total || invoices.value.length
    } catch {
      invoices.value = []
    } finally {
      loading.value = false
    }
  }

  async function fetchStats() {
    try {
      const result = await api.invoices.getStats() as any
      stats.value = {
        total: result.total || 0,
        pending: result.pending || 0,
        paid: result.paid || 0,
        totalAmount: result.totalAmount || 0,
      }
    } catch {
      // ignore
    }
  }

  async function markPaid(id: string) {
    await api.invoices.markPaid(id)
    await fetchInvoices()
    await fetchStats()
  }

  async function cancelInvoice(id: string) {
    await api.invoices.cancel(id)
    await fetchInvoices()
    await fetchStats()
  }

  function setFilters(newFilters: Partial<InvoiceFilters>) {
    filters.value = { ...filters.value, ...newFilters }
    page.value = 1
  }

  function resetFilters() {
    filters.value = {
      search: '',
      status: null,
      startDate: null,
      endDate: null,
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
    invoices,
    loading,
    total,
    page,
    pageSize,
    filters,
    stats,
    pendingInvoices,
    overdueInvoices,
    fetchInvoices,
    fetchStats,
    markPaid,
    cancelInvoice,
    setFilters,
    resetFilters,
    setPage,
    setPageSize,
  }
})
