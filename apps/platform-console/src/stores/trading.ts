import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/api'

export interface TradingOverview {
  totalVolume: number
  totalTrades: number
  totalProfit: number
  activeTenants: number
}

export interface TenantRanking {
  id: string
  name: string
  code: string
  totalVolume: number
  totalTrades: number
  totalProfit: number
  symbols?: TradingSymbol[]
}

export interface TradingSymbol {
  symbol: string
  volume: number
  trades: number
  profit: number
}

export interface SymbolDistribution {
  symbol: string
  volume: number
  percentage: number
}

export type TradingPeriod = 'today' | 'week' | 'month' | 'quarter'

export const useTradingStore = defineStore('trading', () => {
  const period = ref<TradingPeriod>('week')
  const loadingOverview = ref(false)
  const loadingRanking = ref(false)
  const loadingSymbol = ref(false)

  const overview = ref<TradingOverview>({
    totalVolume: 0,
    totalTrades: 0,
    totalProfit: 0,
    activeTenants: 0,
  })

  const tenantRanking = ref<TenantRanking[]>([])
  const symbolDistribution = ref<SymbolDistribution[]>([])

  const isLoading = computed(() =>
    loadingOverview.value || loadingRanking.value || loadingSymbol.value
  )

  const topTenants = computed(() =>
    tenantRanking.value.slice(0, 5)
  )

  const topSymbols = computed(() =>
    symbolDistribution.value.slice(0, 5)
  )

  async function fetchOverview() {
    loadingOverview.value = true
    try {
      const result = await api.tradingData.getOverview({ period: period.value }) as any
      overview.value = {
        totalVolume: result.totalVolume || 0,
        totalTrades: result.totalTrades || 0,
        totalProfit: result.totalProfit || 0,
        activeTenants: result.activeTenants || 0,
      }
    } catch {
      // ignore
    } finally {
      loadingOverview.value = false
    }
  }

  async function fetchTenantRanking(limit = 10) {
    loadingRanking.value = true
    try {
      const result = await api.tradingData.getTenantRanking({
        period: period.value,
        limit,
      }) as any
      tenantRanking.value = Array.isArray(result) ? result : (result.data || [])
    } catch {
      tenantRanking.value = []
    } finally {
      loadingRanking.value = false
    }
  }

  async function fetchSymbolDistribution() {
    loadingSymbol.value = true
    try {
      const result = await api.tradingData.getSymbolDistribution({
        period: period.value,
      }) as any
      symbolDistribution.value = Array.isArray(result) ? result : (result.data || [])
    } catch {
      symbolDistribution.value = []
    } finally {
      loadingSymbol.value = false
    }
  }

  async function fetchTenantDetail(tenantId: string): Promise<TenantRanking | null> {
    try {
      const result = await api.tradingData.getTenantDetail(tenantId, {
        period: period.value,
      }) as any
      return result
    } catch {
      return null
    }
  }

  async function fetchAll() {
    await Promise.all([
      fetchOverview(),
      fetchTenantRanking(),
      fetchSymbolDistribution(),
    ])
  }

  function setPeriod(newPeriod: TradingPeriod) {
    period.value = newPeriod
  }

  function refresh() {
    return fetchAll()
  }

  return {
    period,
    loadingOverview,
    loadingRanking,
    loadingSymbol,
    isLoading,
    overview,
    tenantRanking,
    symbolDistribution,
    topTenants,
    topSymbols,
    fetchOverview,
    fetchTenantRanking,
    fetchSymbolDistribution,
    fetchTenantDetail,
    fetchAll,
    setPeriod,
    refresh,
  }
})
