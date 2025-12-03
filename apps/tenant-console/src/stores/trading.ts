import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Position, Quote, TradeHistory, DashboardStats } from '@/types'
import { tradingApi, type PositionListParams, type HistoryListParams } from '@/api/trading'

export const useTradingStore = defineStore('trading', () => {
  // Dashboard state
  const dashboardStats = ref<DashboardStats | null>(null)
  const dashboardLoading = ref(false)

  // Positions state
  const positions = ref<Position[]>([])
  const positionStats = ref<{ total: number; volume: number; profit: number; longShortRatio: number } | null>(null)
  const positionsTotal = ref(0)
  const positionsPage = ref(1)
  const positionsPageSize = ref(20)
  const positionsLoading = ref(false)

  // Quotes state
  const quotes = ref<Quote[]>([])
  const favorites = ref<string[]>([])
  const quotesLoading = ref(false)

  // History state
  const history = ref<TradeHistory[]>([])
  const historyTotal = ref(0)
  const historyPage = ref(1)
  const historyPageSize = ref(20)
  const historyLoading = ref(false)

  // Getters
  const favoriteQuotes = computed(() => {
    return quotes.value.filter((q) => favorites.value.includes(q.symbol))
  })

  // Dashboard actions
  const loadDashboardStats = async () => {
    dashboardLoading.value = true
    try {
      dashboardStats.value = await tradingApi.getDashboardStats()
      return dashboardStats.value
    } finally {
      dashboardLoading.value = false
    }
  }

  // Position actions
  const loadPositions = async (params?: Partial<PositionListParams>) => {
    positionsLoading.value = true
    try {
      const response = await tradingApi.getPositions({
        page: params?.page || positionsPage.value,
        pageSize: params?.pageSize || positionsPageSize.value,
        login: params?.login,
        symbol: params?.symbol,
        profitFilter: params?.profitFilter,
      })

      positions.value = response.items
      positionsTotal.value = response.total
      positionsPage.value = response.page
      positionsPageSize.value = response.pageSize

      return response
    } finally {
      positionsLoading.value = false
    }
  }

  const loadPositionStats = async () => {
    try {
      positionStats.value = await tradingApi.getPositionStats()
      return positionStats.value
    } catch {
      positionStats.value = null
    }
  }

  // Quote actions
  const loadQuotes = async () => {
    quotesLoading.value = true
    try {
      quotes.value = await tradingApi.getQuotes()
      return quotes.value
    } finally {
      quotesLoading.value = false
    }
  }

  const loadFavorites = async () => {
    try {
      favorites.value = await tradingApi.getFavorites()
    } catch {
      favorites.value = []
    }
  }

  const addFavorite = async (symbol: string) => {
    await tradingApi.addFavorite(symbol)
    if (!favorites.value.includes(symbol)) {
      favorites.value.push(symbol)
    }
  }

  const removeFavorite = async (symbol: string) => {
    await tradingApi.removeFavorite(symbol)
    favorites.value = favorites.value.filter((s) => s !== symbol)
  }

  const updateQuote = (update: { symbol: string; bid: number; ask: number; time: string }) => {
    const index = quotes.value.findIndex((q) => q.symbol === update.symbol)
    if (index !== -1) {
      quotes.value[index] = {
        ...quotes.value[index],
        bid: update.bid,
        ask: update.ask,
        time: update.time,
        spread: Math.round((update.ask - update.bid) * 100000) / 100,
      }
    }
  }

  // History actions
  const loadHistory = async (params?: Partial<HistoryListParams>) => {
    historyLoading.value = true
    try {
      const response = await tradingApi.getHistory({
        page: params?.page || historyPage.value,
        pageSize: params?.pageSize || historyPageSize.value,
        login: params?.login,
        symbol: params?.symbol,
        type: params?.type,
        startDate: params?.startDate,
        endDate: params?.endDate,
      })

      history.value = response.items
      historyTotal.value = response.total
      historyPage.value = response.page
      historyPageSize.value = response.pageSize

      return response
    } finally {
      historyLoading.value = false
    }
  }

  // Update position from websocket
  const updatePosition = (action: 'add' | 'update' | 'remove', position: Position) => {
    if (action === 'add') {
      positions.value.unshift(position)
      positionsTotal.value++
    } else if (action === 'update') {
      const index = positions.value.findIndex((p) => p.ticket === position.ticket)
      if (index !== -1) {
        positions.value[index] = position
      }
    } else if (action === 'remove') {
      positions.value = positions.value.filter((p) => p.ticket !== position.ticket)
      positionsTotal.value--
    }
  }

  return {
    // Dashboard
    dashboardStats,
    dashboardLoading,
    loadDashboardStats,

    // Positions
    positions,
    positionStats,
    positionsTotal,
    positionsPage,
    positionsPageSize,
    positionsLoading,
    loadPositions,
    loadPositionStats,
    updatePosition,

    // Quotes
    quotes,
    favorites,
    quotesLoading,
    favoriteQuotes,
    loadQuotes,
    loadFavorites,
    addFavorite,
    removeFavorite,
    updateQuote,

    // History
    history,
    historyTotal,
    historyPage,
    historyPageSize,
    historyLoading,
    loadHistory,
  }
})
